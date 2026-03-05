//! Shared task data structures used by both Tauri commands and MCP tools.

use rmcp::schemars;
use serde::{Deserialize, Serialize};

use crate::models::tag::Tag;

/// Core task data returned by all queries.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskData {
    pub id: String,
    pub project_id: String,
    pub parent_task_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub description_format: Option<String>,
    pub status: String,
    pub priority: String,
    pub difficulty: Option<String>,
    pub start_date: Option<String>,
    pub due_date: Option<String>,
    pub completed_at: Option<String>,
    pub is_milestone: bool,
    pub sort_order: i32,
    pub kanban_order: String,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Task with associated tags.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskWithTagsData {
    #[serde(flatten)]
    pub task: TaskData,
    pub tags: Vec<Tag>,
}

/// Task detail including tags and subtasks.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskDetailData {
    #[serde(flatten)]
    pub task: TaskData,
    pub tags: Vec<Tag>,
    pub subtasks: Vec<TaskData>,
}

/// Input for creating a new task.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskInput {
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub description_format: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub difficulty: Option<String>,
    pub start_date: Option<String>,
    pub due_date: Option<String>,
    pub parent_task_id: Option<String>,
    pub is_milestone: Option<bool>,
    pub kanban_order: Option<String>,
    pub estimated_hours: Option<f64>,
    pub tag_ids: Option<Vec<String>>,
}

/// Input for updating an existing task.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub description_format: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub difficulty: Option<String>,
    pub start_date: Option<String>,
    pub due_date: Option<String>,
    pub parent_task_id: Option<String>,
    pub is_milestone: Option<bool>,
    pub kanban_order: Option<String>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub tag_ids: Option<Vec<String>>,
    pub project_id: Option<String>,
}

/// Filters for listing tasks.
#[derive(Debug, Clone, Default, Deserialize, schemars::JsonSchema)]
pub struct ListTasksFilter {
    pub project_id: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
}
