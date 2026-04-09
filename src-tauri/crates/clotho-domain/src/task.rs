use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::tag::Tag;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TaskWithTagsData {
    #[serde(flatten)]
    pub task: TaskData,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TaskDetailData {
    #[serde(flatten)]
    pub task: TaskData,
    pub tags: Vec<Tag>,
    pub subtasks: Vec<TaskData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TaskProgressData {
    pub id: String,
    pub task_id: String,
    pub content: String,
    pub content_format: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
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

#[derive(Debug, Clone, Deserialize, JsonSchema)]
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

#[derive(Debug, Clone, Default)]
pub struct TaskPatchInput {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub description_format: Option<Option<String>>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub difficulty: Option<Option<String>>,
    pub start_date: Option<Option<String>>,
    pub due_date: Option<Option<String>>,
    pub parent_task_id: Option<Option<String>>,
    pub is_milestone: Option<bool>,
    pub kanban_order: Option<String>,
    pub estimated_hours: Option<Option<f64>>,
    pub actual_hours: Option<Option<f64>>,
    pub tag_ids: Option<Vec<String>>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
pub struct ListTasksFilter {
    pub project_id: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleStats {
    pub project_id: Option<String>,
    pub total_tasks: i64,
    pub done_tasks: i64,
    pub in_progress_tasks: i64,
    pub todo_tasks: i64,
    pub unscheduled_tasks: i64,
    pub cancelled_tasks: i64,
    pub overdue_tasks: i64,
    pub due_today_tasks: i64,
}
