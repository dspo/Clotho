//! `tauri-plugin-agent-runtime` 是框架对外统一的 plugin 入口。
//!
//! 新宿主应用应直接依赖本 crate，并使用 `agent-runtime` namespace。
//! `tauri-plugin-assistant-runtime` 只作为仓库内部实现承载 crate 存在，
//! 不应被新的宿主应用直接当作公共入口使用。

use tauri::plugin::TauriPlugin;
use tauri::Runtime;

pub const PLUGIN_NAME: &str = "agent-runtime";

pub use agent_core::{
    ActionPolicy, AgentDefinition, AgentError, AgentRuntime, ApprovalMode, AutomationHooks,
    Builder, ExecutionMode, FunctionToolDefinition, FunctionToolHandler, IntegrationRegistration,
    ModelProfile, OutputContract, PermissionSet, ProviderRegistration, ResourceBinding,
    RuntimeConfig, SkillBinding, SkillCatalogRegistration, ToolBinding, ToolProvider, UiMetadata,
    Visibility,
};
pub use tauri_plugin_assistant_runtime::{
    interrupt_turn, resolve_runtime_request, start_headless_turn, AssistantRuntimeState,
    AttachmentRef, ConfigSelection, Error, Result, StartedTurn, StreamDispatch,
};
pub use tauri_plugin_assistant_runtime::{
    AssistantStatusEventEnvelope, AssistantTurnStreamEnvelope, CancelTurnAck,
    ConfigFileCandidate, ConversationBlock, CreateThreadResponse, ListConfigFilesResponse,
    ListThreadsResponse, NativeToolAuditEntry, PendingRuntimeRequest, ResolvedConfig,
    ResumeTurnStreamAck, RuntimeCatalog, RuntimeCatalogIntegration, RuntimeCatalogSkill,
    RuntimeCatalogTool, StartTurnAck, SubmitRuntimeRequestAck, ThreadSnapshot, ThreadSummary,
    TurnSummarySnapshot,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_assistant_runtime::init_with_name(PLUGIN_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_plugin_uses_agent_runtime_namespace() {
        assert_eq!(PLUGIN_NAME, "agent-runtime");
        let _ = Builder::new();
    }
}
