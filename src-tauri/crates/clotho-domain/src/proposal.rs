use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROPOSAL_SCHEMA_VERSION: &str = "clotho.assistant.proposal.v1alpha1";

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProposalPayload {
    pub schema_version: String,
    pub proposal_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub generated_at: String,
    pub summary: String,
    pub intent: String,
    pub reasoning_summary: Option<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    pub requires_confirmation: bool,
    #[serde(default)]
    pub actions: Vec<ProposalAction>,
    #[serde(default)]
    pub artifacts: Vec<ProposalArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProposalAction {
    pub action_id: String,
    pub action_type: ProposalActionType,
    pub target_type: String,
    pub target_id: Option<String>,
    pub title: String,
    pub summary: String,
    pub before_json: Option<Value>,
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
pub struct ProposalArtifact {
    pub artifact_id: String,
    pub artifact_type: ProposalArtifactType,
    pub title: String,
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
