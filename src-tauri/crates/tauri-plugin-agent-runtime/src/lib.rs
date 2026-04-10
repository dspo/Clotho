//! `tauri-plugin-agent-runtime` 是框架对外统一的 Tauri plugin 入口。
//!
//! 它负责通用的 thread/turn/streaming、approval、catalog、config 与
//! runtime bridge；宿主业务逻辑（例如 Clotho 的 domain tools、proposal
//! contract、DB/image 适配）不应放在本 crate 中。

use std::sync::Arc;

mod audit;
mod catalog;
mod commands;
mod config;
mod error;
mod events;
pub mod headless;
mod models;
mod runtime;
mod session;

use serde_json::json;
use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

pub const PLUGIN_NAME: &str = "agent-runtime";

pub use agent_core::{
    ActionPolicy, AgentDefinition, AgentError, AgentRuntime, ApprovalMode, AutomationHooks,
    Builder, ExecutionMode, FunctionToolDefinition, FunctionToolHandler, IntegrationRegistration,
    ModelProfile, OutputContract, PermissionSet, ProviderRegistration, ResourceBinding,
    RuntimeConfig, RuntimeContext, SkillBinding, SkillCatalogRegistration, SoulDefinition,
    ToolBinding, ToolContext, ToolProvider, UiMetadata, Visibility,
};
pub use config::{ConfigProvider, DefaultConfigProvider, MultiSourceConfigProvider, TomlConfigProvider};
pub use error::{Error, Result};
pub use headless::{
    auto_resolve_request, run_headless_turn, AutoResolutionPolicy, HeadlessTurnResult,
    HeadlessTurnRunnerConfig,
};
pub use models::*;
pub use session::{AssistantRuntimeState, StartedTurn, StreamDispatch};
pub type AgentRuntimeState = AssistantRuntimeState;
pub type AgentStatusEventEnvelope = AssistantStatusEventEnvelope;
pub type AgentTurnStreamEnvelope = AssistantTurnStreamEnvelope;

pub struct AgentRuntimePluginBuilder {
    config_provider: Option<Arc<dyn ConfigProvider>>,
    agent_runtime: Option<Arc<AgentRuntime>>,
}

impl Default for AgentRuntimePluginBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentRuntimePluginBuilder {
    pub fn new() -> Self {
        Self {
            config_provider: None,
            agent_runtime: None,
        }
    }

    pub fn config_provider(mut self, config_provider: Arc<dyn ConfigProvider>) -> Self {
        self.config_provider = Some(config_provider);
        self
    }

    pub fn agent_runtime(mut self, agent_runtime: AgentRuntime) -> Self {
        self.agent_runtime = Some(Arc::new(agent_runtime));
        self
    }

    pub fn build<R: Runtime>(self) -> TauriPlugin<R> {
        let config_provider = self
            .config_provider
            .unwrap_or_else(|| Arc::new(DefaultConfigProvider::default()));
        let agent_runtime = self.agent_runtime;

        PluginBuilder::new(PLUGIN_NAME)
            .invoke_handler(tauri::generate_handler![
                commands::list_threads,
                commands::get_thread_snapshot,
                commands::create_thread,
                commands::start_turn,
                commands::resume_turn_stream,
                commands::cancel_turn,
                commands::submit_runtime_request,
                commands::list_configs,
                commands::resolve_config,
                commands::get_runtime_catalog,
            ])
            .setup(move |app, _api| {
                app.manage(AssistantRuntimeState::new(
                    config_provider.clone(),
                    agent_runtime.clone(),
                ));
                Ok(())
            })
            .build()
    }
}

#[derive(Clone, Copy)]
pub(crate) struct RuntimePluginMetadata {
    pub(crate) status_event: &'static str,
    pub(crate) threads_changed_event: &'static str,
    pub(crate) debug_event: &'static str,
    pub(crate) audit_directory: &'static str,
}

pub(crate) const RUNTIME_PLUGIN_METADATA: RuntimePluginMetadata = RuntimePluginMetadata {
    status_event: "agent-runtime://status",
    threads_changed_event: "agent-runtime://threads-changed",
    debug_event: "agent-runtime://debug",
    audit_directory: PLUGIN_NAME,
};

pub(crate) fn runtime_plugin_metadata<R: Runtime>(_app: &AppHandle<R>) -> RuntimePluginMetadata {
    RUNTIME_PLUGIN_METADATA
}

/// Starts a turn from Rust without going through the Tauri command layer.
///
/// This is the intended entrypoint for Rust hosts, harnesses, and tests that embed the runtime
/// directly but still want the same thread/turn lifecycle and event wiring as the command surface.
pub async fn start_headless_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    text: String,
    mode: String,
    attachments: Option<Vec<AttachmentRef>>,
    model_override: Option<String>,
    config_context: Option<ConfigSelection>,
) -> Result<StartTurnAck> {
    let attachments = attachments.unwrap_or_default();
    let started = state
        .start_background_turn(&thread_id, &text, config_context.clone())
        .await?;
    let turn_id = started.turn_id.clone();
    let accepted_at = started.accepted_at.clone();
    let resolved_config_context = state.thread_config_selection(&thread_id).await?;

    match runtime::start_runtime_turn(
        app.clone(),
        state.clone(),
        thread_id.clone(),
        turn_id.clone(),
        text,
        attachments,
        mode,
        model_override,
        resolved_config_context,
    )
    .await
    {
        Ok(()) => {
            events::emit_threads_changed(&app, "updated", Some(&thread_id));
            Ok(StartTurnAck {
                thread_id,
                turn_id,
                accepted_at,
            })
        }
        Err(err) => {
            let StreamDispatch { item, subscribers } = state
                .push_stream_event(
                    &thread_id,
                    &turn_id,
                    "plugin",
                    "turn_failed",
                    json!({
                        "code": "runtime_start_failed",
                        "message": err.to_string(),
                    }),
                )
                .await?;
            for subscriber in subscribers {
                let _ = subscriber.send(item.clone());
            }
            events::emit_threads_changed(&app, "updated", Some(&thread_id));
            Err(err)
        }
    }
}

pub async fn resolve_runtime_request<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
    request_id: String,
    response: serde_json::Value,
) -> Result<String> {
    runtime::submit_runtime_request_response(app, state, thread_id, turn_id, request_id, response)
        .await
}

pub async fn interrupt_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
) -> Result<bool> {
    runtime::interrupt_runtime_turn(app, state, thread_id, turn_id).await
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    AgentRuntimePluginBuilder::new().build()
}

pub fn init_with_builder<R: Runtime>(builder: AgentRuntimePluginBuilder) -> TauriPlugin<R> {
    builder.build()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{
        AgentRuntimePluginBuilder, Builder, DefaultConfigProvider, PLUGIN_NAME,
        RUNTIME_PLUGIN_METADATA,
    };

    #[test]
    fn agent_runtime_metadata_uses_agent_namespace() {
        assert_eq!(PLUGIN_NAME, "agent-runtime");
        assert_eq!(
            RUNTIME_PLUGIN_METADATA.status_event,
            "agent-runtime://status"
        );
        assert_eq!(
            RUNTIME_PLUGIN_METADATA.threads_changed_event,
            "agent-runtime://threads-changed"
        );
        assert_eq!(RUNTIME_PLUGIN_METADATA.debug_event, "agent-runtime://debug");
        assert_eq!(RUNTIME_PLUGIN_METADATA.audit_directory, "agent-runtime");
        let _ = Builder::new();
        let _ = AgentRuntimePluginBuilder::new()
            .config_provider(Arc::new(DefaultConfigProvider::default()));
    }
}
