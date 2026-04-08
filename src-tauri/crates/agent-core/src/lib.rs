use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("execution error: {0}")]
    Execution(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("missing registration: {0}")]
    MissingRegistration(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionSet {
    ReadOnly,
    Operator,
    Automation,
    Debug,
    Custom(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionMode {
    Immediate,
    Background,
    Detached,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Visibility {
    Public,
    Internal,
    Hidden,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalMode {
    Never,
    OnRequest,
    Always,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelProfile {
    pub provider: String,
    pub model: String,
    pub profile: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolBinding {
    pub tool_id: String,
    pub permission: PermissionSet,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillBinding {
    pub skill_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResourceBinding {
    pub resource_id: String,
    pub required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct UiMetadata {
    pub title: Option<String>,
    pub icon: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct AutomationHooks {
    pub enabled: bool,
    pub trigger_kind: Option<String>,
    pub audit_channel: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ActionPolicy {
    Direct,
    ProposalOnly,
    ApprovalRequired {
        mode: ApprovalMode,
        allowed_mutating_tools: Vec<String>,
        blocked_mutating_tools: Vec<String>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum OutputContract {
    FreeformText,
    StructuredArtifact { schema: Value },
    Proposal,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentDefinition {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub instructions: Option<String>,
    pub model_profile: Option<ModelProfile>,
    pub tool_bindings: Vec<ToolBinding>,
    pub skill_bindings: Vec<SkillBinding>,
    pub resource_bindings: Vec<ResourceBinding>,
    pub action_policy: ActionPolicy,
    pub output_contract: OutputContract,
    pub automation_hooks: AutomationHooks,
    pub ui_metadata: UiMetadata,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FunctionToolDefinition {
    pub id: String,
    pub description: String,
    pub namespace: Option<String>,
    pub input_schema: Option<Value>,
    pub output_schema: Option<Value>,
    pub execution_mode: ExecutionMode,
    pub authz: PermissionSet,
    pub visibility: Visibility,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolContext {
    pub agent_id: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub permission: PermissionSet,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeContext {
    pub agent_id: Option<String>,
    pub permission: PermissionSet,
}

#[async_trait]
pub trait FunctionToolHandler: Send + Sync {
    async fn handle(&self, ctx: &ToolContext, input: Value) -> Result<Value, AgentError>;
}

#[async_trait]
pub trait ToolProvider: Send + Sync {
    async fn list_tools(&self, ctx: &RuntimeContext) -> Vec<FunctionToolDefinition>;

    async fn invoke(
        &self,
        _ctx: &ToolContext,
        _tool_id: &str,
        _input: Value,
    ) -> Result<Value, AgentError> {
        Err(AgentError::Execution(
            "invoke not implemented for provider".to_string(),
        ))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillCatalogRegistration {
    pub id: String,
    pub description: Option<String>,
    pub root_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct IntegrationRegistration {
    pub id: String,
    pub kind: String,
    pub config: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderRegistration {
    pub id: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RuntimeConfig {
    pub default_permission: PermissionSet,
    pub provider_adapters: Vec<String>,
    pub audit_enabled: bool,
}

pub struct Builder {
    agents: Vec<AgentDefinition>,
    tools: Vec<FunctionToolDefinition>,
    providers: Vec<ProviderRegistration>,
    provider_impls: Vec<Arc<dyn ToolProvider>>,
    skill_catalogs: Vec<SkillCatalogRegistration>,
    integrations: Vec<IntegrationRegistration>,
    config: Option<RuntimeConfig>,
}

impl Default for Builder {
    fn default() -> Self {
        Self::new()
    }
}

impl Builder {
    pub fn new() -> Self {
        Self {
            agents: Vec::new(),
            tools: Vec::new(),
            providers: Vec::new(),
            provider_impls: Vec::new(),
            skill_catalogs: Vec::new(),
            integrations: Vec::new(),
            config: None,
        }
    }

    pub fn register_agent(&mut self, def: AgentDefinition) -> &mut Self {
        self.agents.push(def);
        self
    }

    pub fn register_tool(&mut self, tool: FunctionToolDefinition) -> &mut Self {
        self.tools.push(tool);
        self
    }

    pub fn register_provider(
        &mut self,
        registration: ProviderRegistration,
        provider: Arc<dyn ToolProvider>,
    ) -> &mut Self {
        self.providers.push(registration);
        self.provider_impls.push(provider);
        self
    }

    pub fn register_skill_catalog(&mut self, registration: SkillCatalogRegistration) -> &mut Self {
        self.skill_catalogs.push(registration);
        self
    }

    pub fn register_integration(&mut self, registration: IntegrationRegistration) -> &mut Self {
        self.integrations.push(registration);
        self
    }

    pub fn set_config(&mut self, config: RuntimeConfig) -> &mut Self {
        self.config = Some(config);
        self
    }

    pub fn build(self) -> Result<AgentRuntime, AgentError> {
        let config = self.config.ok_or_else(|| {
            AgentError::MissingRegistration("runtime config must be registered".to_string())
        })?;

        Ok(AgentRuntime {
            agents: self.agents,
            tools: self.tools,
            providers: self.providers,
            provider_impls: self.provider_impls,
            skill_catalogs: self.skill_catalogs,
            integrations: self.integrations,
            config,
        })
    }
}

pub struct AgentRuntime {
    agents: Vec<AgentDefinition>,
    tools: Vec<FunctionToolDefinition>,
    providers: Vec<ProviderRegistration>,
    provider_impls: Vec<Arc<dyn ToolProvider>>,
    skill_catalogs: Vec<SkillCatalogRegistration>,
    integrations: Vec<IntegrationRegistration>,
    config: RuntimeConfig,
}

impl AgentRuntime {
    pub fn list_agents(&self) -> &[AgentDefinition] {
        &self.agents
    }

    pub fn list_tools(&self) -> &[FunctionToolDefinition] {
        &self.tools
    }

    pub fn list_provider_registrations(&self) -> &[ProviderRegistration] {
        &self.providers
    }

    pub fn list_skill_catalogs(&self) -> &[SkillCatalogRegistration] {
        &self.skill_catalogs
    }

    pub fn list_integrations(&self) -> &[IntegrationRegistration] {
        &self.integrations
    }

    pub fn config(&self) -> &RuntimeConfig {
        &self.config
    }

    pub fn provider_count(&self) -> usize {
        self.provider_impls.len()
    }

    pub async fn list_dynamic_tools(&self, ctx: &RuntimeContext) -> Vec<FunctionToolDefinition> {
        let mut tools = Vec::new();

        for provider in &self.provider_impls {
            for tool in provider.list_tools(ctx).await {
                if tools.iter().any(|existing: &FunctionToolDefinition| existing.id == tool.id) {
                    continue;
                }
                let registered = self.tools.iter().find(|registered| registered.id == tool.id);
                tools.push(registered.cloned().unwrap_or(tool));
            }
        }

        tools
    }

    pub async fn invoke_tool(
        &self,
        ctx: &ToolContext,
        tool_id: &str,
        input: Value,
    ) -> Result<Value, AgentError> {
        let runtime_ctx = RuntimeContext {
            agent_id: ctx.agent_id.clone(),
            permission: ctx.permission.clone(),
        };

        for provider in &self.provider_impls {
            let tools = provider.list_tools(&runtime_ctx).await;
            if tools.iter().any(|tool| tool.id == tool_id) {
                return provider.invoke(ctx, tool_id, input).await;
            }
        }

        Err(AgentError::MissingRegistration(format!(
            "tool `{tool_id}` is not provided by any registered ToolProvider"
        )))
    }
}

pub fn builtin_permission_sets() -> [PermissionSet; 4] {
    [
        PermissionSet::ReadOnly,
        PermissionSet::Operator,
        PermissionSet::Automation,
        PermissionSet::Debug,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    struct EmptyProvider;

    #[async_trait]
    impl ToolProvider for EmptyProvider {
        async fn list_tools(&self, _ctx: &RuntimeContext) -> Vec<FunctionToolDefinition> {
            Vec::new()
        }
    }

    struct EchoProvider;

    #[async_trait]
    impl ToolProvider for EchoProvider {
        async fn list_tools(&self, _ctx: &RuntimeContext) -> Vec<FunctionToolDefinition> {
            vec![FunctionToolDefinition {
                id: "echo".to_string(),
                description: "Echo input".to_string(),
                namespace: Some("demo".to_string()),
                input_schema: None,
                output_schema: None,
                execution_mode: ExecutionMode::Immediate,
                authz: PermissionSet::Operator,
                visibility: Visibility::Public,
            }]
        }

        async fn invoke(
            &self,
            _ctx: &ToolContext,
            tool_id: &str,
            input: Value,
        ) -> Result<Value, AgentError> {
            if tool_id != "echo" {
                return Err(AgentError::Execution(format!("unexpected tool: {tool_id}")));
            }

            Ok(input)
        }
    }

    fn sample_agent() -> AgentDefinition {
        AgentDefinition {
            id: "planner".to_string(),
            name: Some("Planner".to_string()),
            description: Some("Plans work".to_string()),
            instructions: Some("help".to_string()),
            model_profile: Some(ModelProfile {
                provider: "openai".to_string(),
                model: "gpt-5.4".to_string(),
                profile: Some("default".to_string()),
            }),
            tool_bindings: vec![ToolBinding {
                tool_id: "list_tasks".to_string(),
                permission: PermissionSet::ReadOnly,
            }],
            skill_bindings: vec![SkillBinding {
                skill_id: "task-author".to_string(),
            }],
            resource_bindings: vec![ResourceBinding {
                resource_id: "task-db".to_string(),
                required: true,
            }],
            action_policy: ActionPolicy::ProposalOnly,
            output_contract: OutputContract::Proposal,
            automation_hooks: AutomationHooks {
                enabled: true,
                trigger_kind: Some("daily".to_string()),
                audit_channel: Some("sqlite".to_string()),
            },
            ui_metadata: UiMetadata {
                title: Some("Planner".to_string()),
                icon: Some("bot".to_string()),
                tags: vec!["planning".to_string()],
            },
        }
    }

    fn sample_tool() -> FunctionToolDefinition {
        FunctionToolDefinition {
            id: "list_tasks".to_string(),
            description: "List tasks".to_string(),
            namespace: Some("clotho".to_string()),
            input_schema: None,
            output_schema: None,
            execution_mode: ExecutionMode::Immediate,
            authz: PermissionSet::ReadOnly,
            visibility: Visibility::Public,
        }
    }

    #[tokio::test]
    async fn builder_registers_framework_artifacts() {
        let mut builder = Builder::new();
        builder
            .register_agent(sample_agent())
            .register_tool(sample_tool())
            .register_skill_catalog(SkillCatalogRegistration {
                id: "core".to_string(),
                description: Some("Built-in skills".to_string()),
                root_path: ".agents/skills".to_string(),
            })
            .register_integration(IntegrationRegistration {
                id: "mcp".to_string(),
                kind: "transport".to_string(),
                config: Some(serde_json::json!({"url": "http://localhost:7400/mcp"})),
            })
            .register_provider(
                ProviderRegistration {
                    id: "native".to_string(),
                    kind: "local".to_string(),
                },
                Arc::new(EmptyProvider),
            )
            .set_config(RuntimeConfig {
                default_permission: PermissionSet::Operator,
                provider_adapters: vec!["openai".to_string()],
                audit_enabled: true,
            });

        let runtime = builder.build().expect("build");
        assert_eq!(runtime.list_agents().len(), 1);
        assert_eq!(runtime.list_tools().len(), 1);
        assert_eq!(runtime.list_provider_registrations().len(), 1);
        assert_eq!(runtime.list_skill_catalogs().len(), 1);
        assert_eq!(runtime.list_integrations().len(), 1);
        assert_eq!(runtime.provider_count(), 1);
        assert_eq!(runtime.config().default_permission, PermissionSet::Operator);
    }

    #[test]
    fn builtin_permissions_cover_required_sets() {
        assert_eq!(
            builtin_permission_sets(),
            [
                PermissionSet::ReadOnly,
                PermissionSet::Operator,
                PermissionSet::Automation,
                PermissionSet::Debug,
            ]
        );
    }

    #[tokio::test]
    async fn runtime_invokes_provider_backed_tools() {
        let mut builder = Builder::new();
        builder
            .register_provider(
                ProviderRegistration {
                    id: "echo-provider".to_string(),
                    kind: "host".to_string(),
                },
                Arc::new(EchoProvider),
            )
            .set_config(RuntimeConfig {
                default_permission: PermissionSet::Operator,
                provider_adapters: vec!["codex".to_string()],
                audit_enabled: false,
            });

        let runtime = builder.build().expect("build");
        let tools = runtime
            .list_dynamic_tools(&RuntimeContext {
                agent_id: Some("demo".to_string()),
                permission: PermissionSet::Operator,
            })
            .await;
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].id, "echo");

        let output = runtime
            .invoke_tool(
                &ToolContext {
                    agent_id: Some("demo".to_string()),
                    thread_id: Some("thread-1".to_string()),
                    turn_id: Some("turn-1".to_string()),
                    permission: PermissionSet::Operator,
                },
                "echo",
                serde_json::json!({ "hello": "world" }),
            )
            .await
            .expect("invoke tool");
        assert_eq!(output["hello"], "world");
    }
}
