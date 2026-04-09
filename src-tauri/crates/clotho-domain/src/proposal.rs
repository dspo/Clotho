use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROPOSAL_SCHEMA_VERSION: &str = "clotho.assistant.proposal.v1alpha1";

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProposalPayload {
    #[serde(alias = "schema_version")]
    pub schema_version: String,
    #[serde(alias = "proposal_id")]
    pub proposal_id: String,
    #[serde(alias = "thread_id")]
    pub thread_id: String,
    #[serde(alias = "turn_id")]
    pub turn_id: String,
    #[serde(alias = "generated_at")]
    pub generated_at: String,
    pub summary: String,
    pub intent: String,
    #[serde(alias = "reasoning_summary")]
    pub reasoning_summary: Option<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(alias = "requires_confirmation")]
    pub requires_confirmation: bool,
    #[serde(default)]
    pub actions: Vec<ProposalAction>,
    #[serde(default)]
    pub artifacts: Vec<ProposalArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProposalAction {
    #[serde(alias = "action_id")]
    pub action_id: String,
    #[serde(alias = "action_type")]
    pub action_type: ProposalActionType,
    #[serde(alias = "target_type")]
    pub target_type: String,
    #[serde(alias = "target_id")]
    pub target_id: Option<String>,
    pub title: String,
    pub summary: String,
    #[serde(alias = "before_json")]
    pub before_json: Option<Value>,
    #[serde(alias = "after_json")]
    pub after_json: Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProposalActionType {
    CreateTask,
    UpdateTask,
    RescheduleTask,
    BatchUpdateTasks,
    CreateDependency,
    DeleteDependency,
    AddTaskTag,
    RemoveTaskTag,
}

impl ProposalActionType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::CreateTask => "create_task",
            Self::UpdateTask => "update_task",
            Self::RescheduleTask => "reschedule_task",
            Self::BatchUpdateTasks => "batch_update_tasks",
            Self::CreateDependency => "create_dependency",
            Self::DeleteDependency => "delete_dependency",
            Self::AddTaskTag => "add_task_tag",
            Self::RemoveTaskTag => "remove_task_tag",
        }
    }

    pub fn default_target_type(self) -> &'static str {
        match self {
            Self::CreateDependency | Self::DeleteDependency => "dependency",
            _ => "task",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProposalArtifact {
    #[serde(alias = "artifact_id")]
    pub artifact_id: String,
    #[serde(alias = "artifact_type")]
    pub artifact_type: ProposalArtifactType,
    pub title: String,
    #[serde(alias = "content_json")]
    pub content_json: Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProposalArtifactType {
    RoutingDecision,
    ExecutionPlan,
    AnalysisReport,
    ScheduleReport,
    TaskBrief,
    ValidatorNotice,
}
