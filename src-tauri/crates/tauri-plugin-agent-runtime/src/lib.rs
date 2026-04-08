use tauri::plugin::TauriPlugin;
use tauri::Runtime;

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
    tauri_plugin_assistant_runtime::init()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_plugin_exposes_legacy_init() {
        let _ = Builder::new();
    }
}
