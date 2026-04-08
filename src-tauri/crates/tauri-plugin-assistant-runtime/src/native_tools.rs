use std::time::Instant;

use chrono::Utc;
use codex_app_server_protocol::{
    DynamicToolCallOutputContentItem, DynamicToolCallParams, DynamicToolCallResponse,
    DynamicToolSpec,
};
use clotho_adapter::{
    simulate_proposal as simulate_clotho_proposal, DependencyRepository, ListTasksFilter,
    ProjectRepository, ProjectWithStats, ScheduleStats, Tag, TaskData, TaskDependencyDetail,
    TaskDetailData, TaskProgressData, TaskRepository, TaskWithTagsData,
};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use uuid::Uuid;

use crate::audit;
use crate::db;
use crate::error::{Error, Result};
use crate::events;
use crate::models::NativeToolAuditEntry;
use crate::proposal;
use crate::session::AssistantRuntimeState;

const DEFAULT_LIMIT: usize = 50;

pub fn specs() -> Vec<DynamicToolSpec> {
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
            "list_recent_runs",
            "List recent assistant turns in the current app session.",
            json!({
                "type": "object",
                "properties": {
                    "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
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

pub fn execute<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    params: &DynamicToolCallParams,
) -> DynamicToolCallResponse {
    let started_at = Utc::now().to_rfc3339();
    let started = Instant::now();
    let local_turn = state.resolve_local_turn_for_runtime(&params.thread_id, &params.turn_id);

    let (result, success) = match execute_inner(app, state, params) {
        Ok(value) => (value, true),
        Err(err) => (
            json!({
                "error": err.to_string(),
                "tool": params.tool,
            }),
            false,
        ),
    };
    let response = response_from_json(result.clone(), success);

    let (local_thread_id, local_turn_id) = match local_turn {
        Some((thread_id, turn_id)) => (Some(thread_id), Some(turn_id)),
        None => (None, None),
    };
    let entry = NativeToolAuditEntry {
        audit_id: Uuid::new_v4().to_string(),
        tool_name: params.tool.clone(),
        call_id: params.call_id.clone(),
        runtime_thread_id: params.thread_id.clone(),
        runtime_turn_id: params.turn_id.clone(),
        local_thread_id,
        local_turn_id,
        executed_at: started_at,
        duration_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        success,
        summary: truncate_audit_summary(&summarize_json_value(&result)),
        arguments: params.arguments.clone(),
        result,
    };

    if let Err(err) = audit::append_native_tool_audit(app, &entry) {
        events::emit_debug(
            app,
            format!(
                "failed to append native tool audit for `{}`: {err}",
                params.tool
            ),
        );
    }

    response
}

fn execute_inner<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    params: &DynamicToolCallParams,
) -> Result<Value> {
    if params.tool == "list_recent_runs" {
        return Ok(json!({
            "items": state.list_recent_runs_value(
                bounded_limit(&params.arguments, "limit", 20, 100)
            ),
        }));
    }

    let conn = db::open_connection(app)?;

    match params.tool.as_str() {
        "get_project" => get_project(&conn, &required_string(&params.arguments, "id")?),
        "list_projects" => list_projects(
            &conn,
            optional_string(&params.arguments, "status").as_deref(),
            bounded_limit(&params.arguments, "limit", DEFAULT_LIMIT, 200),
        ),
        "get_task" => get_task(&conn, &required_string(&params.arguments, "id")?),
        "list_tasks" => list_tasks(
            &conn,
            optional_string(&params.arguments, "projectId").as_deref(),
            optional_string(&params.arguments, "status").as_deref(),
            optional_string(&params.arguments, "priority").as_deref(),
            bounded_limit(&params.arguments, "limit", DEFAULT_LIMIT, 200),
        ),
        "search_tasks" => search_tasks(
            &conn,
            &required_string(&params.arguments, "query")?,
            optional_string(&params.arguments, "projectId").as_deref(),
            bounded_limit(&params.arguments, "limit", DEFAULT_LIMIT, 100),
        ),
        "list_dependencies" => list_dependencies(
            &conn,
            optional_string(&params.arguments, "taskId").as_deref(),
            bounded_limit(&params.arguments, "limit", DEFAULT_LIMIT, 200),
        ),
        "get_schedule_stats" => get_schedule_stats(
            &conn,
            optional_string(&params.arguments, "projectId").as_deref(),
        ),
        "simulate_proposal" => simulate_proposal(&conn, &params.arguments, &params.thread_id, &params.turn_id),
        other => Err(Error::InvalidInput(format!(
            "unknown dynamic tool `{other}`"
        ))),
    }
}

fn spec(name: &str, description: &str, input_schema: Value) -> DynamicToolSpec {
    DynamicToolSpec {
        name: name.to_string(),
        description: description.to_string(),
        input_schema,
        defer_loading: false,
    }
}

fn response_from_json(value: Value, success: bool) -> DynamicToolCallResponse {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
    DynamicToolCallResponse {
        content_items: vec![DynamicToolCallOutputContentItem::InputText { text }],
        success,
    }
}

fn truncate_audit_summary(summary: &str) -> String {
    let max_chars = 400;
    let truncated = summary.chars().take(max_chars).collect::<String>();
    if summary.chars().count() > max_chars {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn required_string(arguments: &Value, key: &str) -> Result<String> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| Error::InvalidInput(format!("missing required argument `{key}`")))
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

fn domain_error(error: clotho_adapter::DomainError) -> Error {
    match error {
        clotho_adapter::DomainError::Database(err) => Error::Sqlite(err),
        clotho_adapter::DomainError::NotFound(message) => Error::NotFound(message),
        clotho_adapter::DomainError::InvalidInput(message) => Error::InvalidInput(message),
        clotho_adapter::DomainError::Conflict(message) => Error::Conflict(message),
    }
}

fn get_project(conn: &rusqlite::Connection, id: &str) -> Result<Value> {
    let project = ProjectRepository::get_with_stats(conn, id).map_err(domain_error)?;
    Ok(project_with_stats_value(&project))
}

fn list_projects(
    conn: &rusqlite::Connection,
    status: Option<&str>,
    limit: usize,
) -> Result<Value> {
    let mut items = ProjectRepository::list(conn, status).map_err(domain_error)?;
    items.truncate(limit);
    Ok(json!({
        "items": items.iter().map(project_with_stats_value).collect::<Vec<_>>(),
    }))
}

fn get_task(conn: &rusqlite::Connection, id: &str) -> Result<Value> {
    let detail = TaskRepository::get_detail(conn, id).map_err(domain_error)?;
    let progress = TaskRepository::list_progress_limited(conn, id, Some(20)).map_err(domain_error)?;
    Ok(task_detail_value(&detail, &progress))
}

fn list_tasks(
    conn: &rusqlite::Connection,
    project_id: Option<&str>,
    status: Option<&str>,
    priority: Option<&str>,
    limit: usize,
) -> Result<Value> {
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
    conn: &rusqlite::Connection,
    query: &str,
    project_id: Option<&str>,
    limit: usize,
) -> Result<Value> {
    let items =
        TaskRepository::search_limited(conn, query, project_id, limit).map_err(domain_error)?;
    Ok(json!({
        "items": items.iter().map(task_with_tags_value).collect::<Vec<_>>(),
    }))
}

fn list_dependencies(
    conn: &rusqlite::Connection,
    task_id: Option<&str>,
    limit: usize,
) -> Result<Value> {
    let items = DependencyRepository::list_detailed(conn, task_id, limit).map_err(domain_error)?;
    Ok(json!({
        "items": items.iter().map(dependency_value).collect::<Vec<_>>(),
    }))
}

fn get_schedule_stats(conn: &rusqlite::Connection, project_id: Option<&str>) -> Result<Value> {
    let stats = TaskRepository::get_schedule_stats(conn, project_id).map_err(domain_error)?;
    Ok(schedule_stats_value(&stats))
}

fn simulate_proposal(
    conn: &rusqlite::Connection,
    arguments: &Value,
    thread_id: &str,
    turn_id: &str,
) -> Result<Value> {
    let proposal_value = arguments
        .get("proposal")
        .cloned()
        .ok_or_else(|| Error::InvalidInput("missing required argument `proposal`".to_string()))?;
    let proposal = proposal::canonicalize_candidate(proposal_value, thread_id, turn_id)
        .ok_or_else(|| {
            Error::InvalidInput(
                "proposal must be a valid Clotho proposal candidate".to_string(),
            )
        })?;
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

fn summarize_json_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::String(text) => text.clone(),
        _ => serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()),
    }
}
