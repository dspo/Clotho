use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadsRequest {
    pub limit: Option<usize>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub thread_id: String,
    pub title: String,
    pub last_message_preview: String,
    pub updated_at: String,
    pub has_running_turn: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadsResponse {
    pub items: Vec<ThreadSummary>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSelection {
    pub config_id: Option<String>,
    pub profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub kind: Option<String>,
    pub id: Option<String>,
    pub name: Option<String>,
    pub mime_type: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBlock {
    pub block_id: String,
    pub kind: String,
    pub title: Option<String>,
    pub text: String,
    pub status: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnSummarySnapshot {
    pub turn_id: String,
    pub status: String,
    pub accepted_at: String,
    pub last_seq: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSnapshot {
    pub thread_id: String,
    pub title: String,
    pub blocks: Vec<ConversationBlock>,
    pub active_turn: Option<TurnSummarySnapshot>,
    pub config_context: Option<ResolvedConfig>,
    pub pending_requests: Vec<PendingRuntimeRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateThreadResponse {
    pub thread_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantTurnStreamEnvelope {
    pub stream_id: String,
    pub item_id: String,
    pub seq: u64,
    pub emitted_at: String,
    pub thread_id: String,
    pub turn_id: String,
    pub source: String,
    pub kind: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTurnAck {
    pub thread_id: String,
    pub turn_id: String,
    pub accepted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeTurnStreamAck {
    pub thread_id: String,
    pub turn_id: String,
    pub resumed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelTurnAck {
    pub thread_id: String,
    pub turn_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitRuntimeRequestAck {
    pub accepted: bool,
    pub request_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDescriptor {
    pub config_id: String,
    pub label: String,
    pub source: String,
    pub config_file_path: Option<String>,
    pub exists: bool,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListConfigsResponse {
    pub items: Vec<ConfigDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCatalogTool {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeToolAuditEntry {
    pub audit_id: String,
    pub tool_name: String,
    pub call_id: String,
    pub runtime_thread_id: String,
    pub runtime_turn_id: String,
    pub local_thread_id: Option<String>,
    pub local_turn_id: Option<String>,
    pub executed_at: String,
    pub duration_ms: u64,
    pub success: bool,
    pub summary: String,
    pub arguments: Value,
    pub result: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCatalogSkill {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCatalogIntegration {
    pub name: String,
    pub kind: String,
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCatalog {
    pub tools: Vec<RuntimeCatalogTool>,
    pub tool_audit_log_path: Option<String>,
    pub tool_audits: Vec<NativeToolAuditEntry>,
    pub skills: Vec<RuntimeCatalogSkill>,
    pub integrations: Vec<RuntimeCatalogIntegration>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConfig {
    pub config_id: String,
    pub label: String,
    pub source: String,
    pub config_file_path: Option<String>,
    pub profile: Option<String>,
    pub model: String,
    pub provider: String,
    pub base_url: Option<String>,
    pub env_key: Option<String>,
    pub wire_api: String,
    pub approval_policy: Option<String>,
    pub sandbox_mode: Option<String>,
    pub reasoning_effort: Option<String>,
    pub reasoning_summary: Option<String>,
    pub verbosity: Option<String>,
    pub personality: Option<String>,
    pub service_tier: Option<String>,
    pub provider_config: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRuntimeRequest {
    pub request_id: String,
    pub request_kind: String,
    pub item_id: Option<String>,
    pub approval_id: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub payload: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStatusEventEnvelope {
    pub event_id: String,
    pub emitted_at: String,
    pub source: String,
    pub r#type: String,
    pub payload: Value,
}
