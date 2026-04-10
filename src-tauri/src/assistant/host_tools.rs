use std::path::PathBuf;
use std::sync::OnceLock;

use async_trait::async_trait;
use clotho_domain::{
    simulate_proposal as simulate_clotho_proposal, DependencyRepository, DomainError,
    ListTasksFilter, ProjectRepository, ProjectWithStats, ScheduleStats, Tag, TaskData,
    TaskDependencyDetail, TaskDetailData, TaskProgressData, TaskRepository, TaskWithTagsData,
};
use rusqlite::Connection;
use serde_json::{json, Value};
use tauri_plugin_agent_runtime::{
    AgentError, ExecutionMode, FunctionToolDefinition, PermissionSet, RuntimeContext, ToolContext,
    ToolProvider, Visibility,
};

use crate::db;

const DEFAULT_LIMIT: usize = 50;

static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub struct ClothoToolProvider;

pub fn configure_app_data_dir(app_data_dir: PathBuf) {
    let _ = APP_DATA_DIR.set(app_data_dir);
}

#[async_trait]
impl ToolProvider for ClothoToolProvider {
    async fn list_tools(&self, _ctx: &RuntimeContext) -> Vec<FunctionToolDefinition> {
        vec![
            spec(
                "get_project",
                "Get one Clotho project with summary stats.",
                json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" }
                    },
                    "required": ["id"],
                    "additionalProperties": false
                }),
            ),
            spec(
                "list_projects",
                "List Clotho projects and task summary stats.",
                json!({
                    "type": "object",
                    "properties": {
                        "status": { "type": "string" },
                        "limit": { "type": "integer", "minimum": 1, "maximum": 200 }
                    },
                    "additionalProperties": false
                }),
            ),
            spec(
                "get_task",
                "Get one Clotho task with tags, subtasks and recent progress.",
                json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" }
                    },
                    "required": ["id"],
                    "additionalProperties": false
                }),
            ),
            spec(
                "list_tasks",
                "List Clotho tasks by optional project, status or priority filters.",
                json!({
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string" },
                        "status": { "type": "string" },
                        "priority": { "type": "string" },
                        "limit": { "type": "integer", "minimum": 1, "maximum": 200 }
                    },
                    "additionalProperties": false
                }),
            ),
            spec(
                "search_tasks",
                "Search Clotho tasks by title or description.",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "projectId": { "type": "string" },
                        "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
                    },
                    "required": ["query"],
                    "additionalProperties": false
                }),
            ),
            spec(
                "list_dependencies",
                "List Clotho task dependencies, optionally scoped to one task.",
                json!({
                    "type": "object",
                    "properties": {
                        "taskId": { "type": "string" },
                        "limit": { "type": "integer", "minimum": 1, "maximum": 200 }
                    },
                    "additionalProperties": false
                }),
            ),
            spec(
                "get_schedule_stats",
                "Get aggregate schedule stats, including overdue and due-today tasks.",
                json!({
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string" }
                    },
                    "additionalProperties": false
                }),
            ),
            spec(
                "simulate_proposal",
                "Validate and simulate a Clotho proposal without applying changes.",
                json!({
                    "type": "object",
                    "properties": {
                        "proposal": {
                            "type": "object"
                        }
                    },
                    "required": ["proposal"],
                    "additionalProperties": false
                }),
            ),
        ]
    }

    async fn invoke(
        &self,
        _ctx: &ToolContext,
        tool_id: &str,
        input: Value,
    ) -> Result<Value, AgentError> {
        let conn = open_connection()?;
        match tool_id {
            "get_project" => get_project(&conn, &required_string(&input, "id")?),
            "list_projects" => list_projects(
                &conn,
                optional_string(&input, "status").as_deref(),
                bounded_limit(&input, "limit", DEFAULT_LIMIT, 200),
            ),
            "get_task" => get_task(&conn, &required_string(&input, "id")?),
            "list_tasks" => list_tasks(
                &conn,
                optional_string(&input, "projectId").as_deref(),
                optional_string(&input, "status").as_deref(),
                optional_string(&input, "priority").as_deref(),
                bounded_limit(&input, "limit", DEFAULT_LIMIT, 200),
            ),
            "search_tasks" => search_tasks(
                &conn,
                &required_string(&input, "query")?,
                optional_string(&input, "projectId").as_deref(),
                bounded_limit(&input, "limit", DEFAULT_LIMIT, 100),
            ),
            "list_dependencies" => list_dependencies(
                &conn,
                optional_string(&input, "taskId").as_deref(),
                bounded_limit(&input, "limit", DEFAULT_LIMIT, 200),
            ),
            "get_schedule_stats" => get_schedule_stats(
                &conn,
                optional_string(&input, "projectId").as_deref(),
            ),
            "simulate_proposal" => simulate_proposal(&conn, &input),
            other => Err(AgentError::InvalidInput(format!("unknown dynamic tool `{other}`"))),
        }
    }
}

fn open_connection() -> Result<Connection, AgentError> {
    let app_data_dir = APP_DATA_DIR
        .get()
        .cloned()
        .ok_or_else(|| AgentError::Execution("host app data dir is unavailable".to_string()))?;
    db::init::initialize_db(app_data_dir).map_err(|error| AgentError::Execution(error.to_string()))
}

fn spec(id: &str, description: &str, input_schema: Value) -> FunctionToolDefinition {
    FunctionToolDefinition {
        id: id.to_string(),
        description: description.to_string(),
        namespace: Some("clotho".to_string()),
        input_schema: Some(input_schema),
        output_schema: None,
        execution_mode: ExecutionMode::Immediate,
        authz: PermissionSet::ReadOnly,
        visibility: Visibility::Public,
    }
}

fn required_string(arguments: &Value, key: &str) -> Result<String, AgentError> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AgentError::InvalidInput(format!("missing required argument `{key}`")))
}

fn optional_string(arguments: &Value, key: &str) -> Option<String> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn bounded_limit(arguments: &Value, key: &str, default: usize, max: usize) -> usize {
    arguments
        .get(key)
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(default)
        .clamp(1, max)
}

fn domain_error(error: DomainError) -> AgentError {
    match error {
        DomainError::Database(err) => AgentError::Execution(err.to_string()),
        DomainError::NotFound(message) => AgentError::Execution(format!("not found: {message}")),
        DomainError::InvalidInput(message) => AgentError::InvalidInput(message),
        DomainError::Conflict(message) => AgentError::Execution(format!("conflict: {message}")),
    }
}

fn get_project(conn: &Connection, id: &str) -> Result<Value, AgentError> {
    let project = ProjectRepository::get_with_stats(conn, id).map_err(domain_error)?;
    Ok(project_with_stats_value(&project))
}

fn list_projects(conn: &Connection, status: Option<&str>, limit: usize) -> Result<Value, AgentError> {
    let mut items = ProjectRepository::list(conn, status).map_err(domain_error)?;
    items.truncate(limit);
    Ok(json!({
        "items": items.iter().map(project_with_stats_value).collect::<Vec<_>>(),
    }))
}

fn get_task(conn: &Connection, id: &str) -> Result<Value, AgentError> {
    let detail = TaskRepository::get_detail(conn, id).map_err(domain_error)?;
    let progress = TaskRepository::list_progress_limited(conn, id, Some(20)).map_err(domain_error)?;
    Ok(task_detail_value(&detail, &progress))
}

fn list_tasks(
    conn: &Connection,
    project_id: Option<&str>,
    status: Option<&str>,
    priority: Option<&str>,
    limit: usize,
) -> Result<Value, AgentError> {
    let filter = ListTasksFilter {
        project_id: project_id.map(str::to_string),
        status: status.map(str::to_string),
        priority: priority.map(str::to_string),
    };
    let items = TaskRepository::list_limited(conn, &filter, Some(limit)).map_err(domain_error)?;
    Ok(json!({
        "items": items.iter().map(task_with_tags_value).collect::<Vec<_>>(),
    }))
}

fn search_tasks(
    conn: &Connection,
    query: &str,
    project_id: Option<&str>,
    limit: usize,
) -> Result<Value, AgentError> {
    let items =
        TaskRepository::search_limited(conn, query, project_id, limit).map_err(domain_error)?;
    Ok(json!({
        "items": items.iter().map(task_with_tags_value).collect::<Vec<_>>(),
    }))
}

fn list_dependencies(conn: &Connection, task_id: Option<&str>, limit: usize) -> Result<Value, AgentError> {
    let items = DependencyRepository::list_detailed(conn, task_id, limit).map_err(domain_error)?;
    Ok(json!({
        "items": items.iter().map(dependency_value).collect::<Vec<_>>(),
    }))
}

fn get_schedule_stats(conn: &Connection, project_id: Option<&str>) -> Result<Value, AgentError> {
    let stats = TaskRepository::get_schedule_stats(conn, project_id).map_err(domain_error)?;
    Ok(schedule_stats_value(&stats))
}

fn simulate_proposal(conn: &Connection, arguments: &Value) -> Result<Value, AgentError> {
    let proposal_value = arguments
        .get("proposal")
        .cloned()
        .ok_or_else(|| AgentError::InvalidInput("missing required argument `proposal`".to_string()))?;
    let proposal = serde_json::from_value::<clotho_domain::ProposalPayload>(proposal_value)
        .map_err(|error| AgentError::InvalidInput(format!("proposal must be valid JSON payload: {error}")))?;
    let simulation = simulate_clotho_proposal(conn, &proposal);

    Ok(json!({
        "proposal": proposal,
        "simulation": simulation,
    }))
}

fn project_with_stats_value(project: &ProjectWithStats) -> Value {
    json!({
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "color": project.color,
        "icon": project.icon,
        "status": project.status,
        "sortOrder": project.sort_order,
        "createdAt": project.created_at,
        "updatedAt": project.updated_at,
        "totalTasks": project.total_tasks,
        "completedTasks": project.completed_tasks,
    })
}

fn task_detail_value(detail: &TaskDetailData, progress: &[TaskProgressData]) -> Value {
    json!({
        "task": task_value(&detail.task),
        "tags": tags_value(&detail.tags),
        "subtasks": detail.subtasks.iter().map(task_value).collect::<Vec<_>>(),
        "progress": progress.iter().map(task_progress_value).collect::<Vec<_>>(),
    })
}

fn task_with_tags_value(item: &TaskWithTagsData) -> Value {
    json!({
        "task": task_value(&item.task),
        "tags": tags_value(&item.tags),
    })
}

fn task_value(task: &TaskData) -> Value {
    json!({
        "id": task.id,
        "projectId": task.project_id,
        "parentTaskId": task.parent_task_id,
        "title": task.title,
        "description": task.description,
        "descriptionFormat": task.description_format,
        "status": task.status,
        "priority": task.priority,
        "difficulty": task.difficulty,
        "startDate": task.start_date,
        "dueDate": task.due_date,
        "completedAt": task.completed_at,
        "isMilestone": task.is_milestone,
        "sortOrder": task.sort_order,
        "kanbanOrder": task.kanban_order,
        "estimatedHours": task.estimated_hours,
        "actualHours": task.actual_hours,
        "createdAt": task.created_at,
        "updatedAt": task.updated_at,
    })
}

fn tags_value(tags: &[Tag]) -> Value {
    Value::Array(tags.iter().map(tag_value).collect())
}

fn tag_value(tag: &Tag) -> Value {
    json!({
        "id": tag.id,
        "name": tag.name,
        "color": tag.color,
        "createdAt": tag.created_at,
    })
}

fn task_progress_value(progress: &TaskProgressData) -> Value {
    json!({
        "id": progress.id,
        "taskId": progress.task_id,
        "content": progress.content,
        "contentFormat": progress.content_format,
        "createdAt": progress.created_at,
    })
}

fn dependency_value(dependency: &TaskDependencyDetail) -> Value {
    json!({
        "id": dependency.id,
        "predecessorId": dependency.predecessor_id,
        "predecessorTitle": dependency.predecessor_title,
        "successorId": dependency.successor_id,
        "successorTitle": dependency.successor_title,
        "dependencyType": dependency.dependency_type,
        "createdAt": dependency.created_at,
    })
}

fn schedule_stats_value(stats: &ScheduleStats) -> Value {
    json!({
        "projectId": stats.project_id,
        "totalTasks": stats.total_tasks,
        "doneTasks": stats.done_tasks,
        "inProgressTasks": stats.in_progress_tasks,
        "todoTasks": stats.todo_tasks,
        "unscheduledTasks": stats.unscheduled_tasks,
        "cancelledTasks": stats.cancelled_tasks,
        "overdueTasks": stats.overdue_tasks,
        "dueTodayTasks": stats.due_today_tasks,
    })
}
