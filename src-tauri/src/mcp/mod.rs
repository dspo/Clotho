use std::sync::Arc;

use rmcp::{
    ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::*,
    schemars,
    tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService,
        session::local::LocalSessionManager,
    },
};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use crate::data::{CreateTaskInput, ListTasksFilter, UpdateTaskInput};
use crate::repository::{ProjectRepository, TagRepository, TaskRepository};
use crate::state::AppState;

// ────────────────────────── parameter structs ────────────────────────── //

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListTasksParams {
    #[schemars(description = "Optional project ID to filter by")]
    project_id: Option<String>,
    #[schemars(description = "Optional status filter (backlog, todo, in_progress, done, cancelled)")]
    status: Option<String>,
    #[schemars(description = "Optional priority filter (urgent, high, medium, low)")]
    priority: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetTaskParams {
    #[schemars(description = "Task ID")]
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateTaskParams {
    #[schemars(description = "Project ID to create the task in")]
    project_id: String,
    #[schemars(description = "Task title")]
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    #[schemars(description = "Start date in YYYY-MM-DD format")]
    start_date: Option<String>,
    #[schemars(description = "Due date in YYYY-MM-DD format")]
    due_date: Option<String>,
    #[schemars(description = "Estimated hours to complete the task")]
    estimated_hours: Option<f64>,
    tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateTaskParams {
    #[schemars(description = "Task ID")]
    id: String,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    start_date: Option<String>,
    due_date: Option<String>,
    #[schemars(description = "Estimated hours to complete the task")]
    estimated_hours: Option<f64>,
    #[schemars(description = "Actual hours spent on the task")]
    actual_hours: Option<f64>,
    tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct DeleteTaskParams {
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SearchTasksParams {
    query: String,
    project_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetProjectParams {
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateProjectParams {
    name: String,
    color: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateProjectParams {
    id: String,
    name: Option<String>,
    color: Option<String>,
    status: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct DeleteProjectParams {
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateTagParams {
    name: String,
    color: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateTagParams {
    id: String,
    name: Option<String>,
    color: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct DeleteTagParams {
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct TaskTagParams {
    task_id: String,
    tag_id: String,
}

// ────────────────────────── server struct ────────────────────────── //

#[derive(Clone)]
pub struct ClothoMcpServer {
    state: Arc<AppState>,
    tool_router: ToolRouter<Self>,
}

impl ClothoMcpServer {
    pub fn new(state: Arc<AppState>) -> Self {
        Self {
            state,
            tool_router: Self::tool_router(),
        }
    }

    fn lock_db(&self) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, ErrorData> {
        self.state.db.lock().map_err(|_| {
            ErrorData::new(ErrorCode::INTERNAL_ERROR, "failed to acquire database lock", None)
        })
    }
}

// ────────────────────────── tool implementations ────────────────────────── //

#[tool_router]
impl ClothoMcpServer {
    #[tool(description = "List tasks with optional filters for project, status, and priority")]
    fn list_tasks(&self, Parameters(p): Parameters<ListTasksParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let filter = ListTasksFilter {
            project_id: p.project_id,
            status: p.status,
            priority: p.priority,
        };
        let tasks = TaskRepository::list(&db, &filter).map_err(app_err)?;
        ok_json(&tasks)
    }

    #[tool(description = "Get a task by ID including its subtasks and tags")]
    fn get_task(&self, Parameters(p): Parameters<GetTaskParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let detail = TaskRepository::get_detail(&db, &p.id).map_err(app_err)?;
        ok_json(&detail)
    }

    #[tool(description = "Create a new task")]
    fn create_task(&self, Parameters(p): Parameters<CreateTaskParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let input = CreateTaskInput {
            project_id: p.project_id,
            title: p.title,
            description: p.description,
            description_format: None,
            status: p.status,
            priority: p.priority,
            start_date: p.start_date,
            due_date: p.due_date,
            parent_task_id: None,
            is_milestone: None,
            kanban_order: None,
            estimated_hours: p.estimated_hours,
            tag_ids: p.tag_ids,
        };
        let task = TaskRepository::create(&db, &input).map_err(app_err)?;
        ok_json(&task)
    }

    #[tool(description = "Update an existing task. Only provided fields are changed.")]
    fn update_task(&self, Parameters(p): Parameters<UpdateTaskParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let input = UpdateTaskInput {
            title: p.title,
            description: p.description,
            description_format: None,
            status: p.status,
            priority: p.priority,
            start_date: p.start_date,
            due_date: p.due_date,
            parent_task_id: None,
            is_milestone: None,
            kanban_order: None,
            estimated_hours: p.estimated_hours,
            actual_hours: p.actual_hours,
            tag_ids: p.tag_ids,
        };
        let task = TaskRepository::update(&db, &p.id, &input).map_err(app_err)?;
        ok_json(&task)
    }

    #[tool(description = "Delete a task by ID (soft delete)")]
    fn delete_task(&self, Parameters(p): Parameters<DeleteTaskParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        TaskRepository::delete(&db, &p.id).map_err(app_err)?;
        ok_json(&serde_json::json!({ "deleted": true }))
    }

    #[tool(description = "Search tasks by title or description keywords")]
    fn search_tasks(&self, Parameters(p): Parameters<SearchTasksParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let tasks = TaskRepository::search(&db, &p.query, p.project_id.as_deref()).map_err(app_err)?;
        ok_json(&tasks)
    }

    #[tool(description = "List all active projects")]
    fn list_projects(&self) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let projects = ProjectRepository::list(&db, Some("active")).map_err(app_err)?;
        ok_json(&projects)
    }

    #[tool(description = "Get a project by ID")]
    fn get_project(&self, Parameters(p): Parameters<GetProjectParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let project = ProjectRepository::get(&db, &p.id).map_err(app_err)?;
        ok_json(&project)
    }

    #[tool(description = "Create a new project")]
    fn create_project(&self, Parameters(p): Parameters<CreateProjectParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let project = ProjectRepository::create(&db, &p.name, p.description.as_deref(), p.color.as_deref())
            .map_err(app_err)?;
        ok_json(&project)
    }

    #[tool(description = "Update an existing project")]
    fn update_project(&self, Parameters(p): Parameters<UpdateProjectParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let project = ProjectRepository::update(
            &db,
            &p.id,
            p.name.as_deref(),
            p.description.as_deref(),
            p.color.as_deref(),
            None, // icon
            p.status.as_deref(),
        )
        .map_err(app_err)?;
        ok_json(&project)
    }

    #[tool(description = "Delete a project and all its tasks")]
    fn delete_project(&self, Parameters(p): Parameters<DeleteProjectParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        ProjectRepository::delete(&db, &p.id).map_err(app_err)?;
        ok_json(&serde_json::json!({ "deleted": true }))
    }

    #[tool(description = "List all tags")]
    fn list_tags(&self) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let tags = TagRepository::list(&db).map_err(app_err)?;
        ok_json(&tags)
    }

    #[tool(description = "Create a new tag")]
    fn create_tag(&self, Parameters(p): Parameters<CreateTagParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let tag = TagRepository::create(&db, &p.name, p.color.as_deref()).map_err(app_err)?;
        ok_json(&tag)
    }

    #[tool(description = "Update a tag's name or color")]
    fn update_tag(&self, Parameters(p): Parameters<UpdateTagParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let tag = TagRepository::update(&db, &p.id, p.name.as_deref(), p.color.as_deref())
            .map_err(app_err)?;
        ok_json(&tag)
    }

    #[tool(description = "Delete a tag and remove it from all tasks")]
    fn delete_tag(&self, Parameters(p): Parameters<DeleteTagParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        TagRepository::delete(&db, &p.id).map_err(app_err)?;
        ok_json(&serde_json::json!({ "deleted": true }))
    }

    #[tool(description = "Add a tag to a task")]
    fn add_task_tag(&self, Parameters(p): Parameters<TaskTagParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        let created = TagRepository::add_to_task(&db, &p.task_id, &p.tag_id).map_err(app_err)?;
        ok_json(&serde_json::json!({ "added": created }))
    }

    #[tool(description = "Remove a tag from a task")]
    fn remove_task_tag(&self, Parameters(p): Parameters<TaskTagParams>) -> Result<CallToolResult, ErrorData> {
        let db = self.lock_db()?;
        TagRepository::remove_from_task(&db, &p.task_id, &p.tag_id).map_err(app_err)?;
        ok_json(&serde_json::json!({ "removed": true }))
    }
}

// ────────────────────────── ServerHandler ────────────────────────── //

#[tool_handler(router = self.tool_router)]
impl ServerHandler for ClothoMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some("Clotho task management. Manage tasks, projects, and tags.".into()),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

// ────────────────────────── server startup ────────────────────────── //

pub async fn start_server(
    state: Arc<AppState>,
    bind_addr: &str,
    cancellation_token: CancellationToken,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let service: StreamableHttpService<ClothoMcpServer, LocalSessionManager> =
        StreamableHttpService::new(
            {
                let state = Arc::clone(&state);
                move || Ok(ClothoMcpServer::new(Arc::clone(&state)))
            },
            Default::default(),
            StreamableHttpServerConfig {
                stateful_mode: true,
                cancellation_token: cancellation_token.child_token(),
                ..Default::default()
            },
        );

    let router = axum::Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    eprintln!("[MCP] listening on http://{}/mcp", listener.local_addr()?);

    axum::serve(listener, router)
        .with_graceful_shutdown(async move { cancellation_token.cancelled().await })
        .await?;

    Ok(())
}

// ────────────────────────── helpers ────────────────────────── //

fn app_err(e: crate::error::AppError) -> ErrorData {
    match e {
        crate::error::AppError::NotFound(msg) => {
            ErrorData::new(ErrorCode::INVALID_PARAMS, format!("{msg} not found"), None)
        }
        crate::error::AppError::Database(e) => {
            ErrorData::new(ErrorCode::INTERNAL_ERROR, format!("database error: {e}"), None)
        }
        crate::error::AppError::InvalidInput(msg) => {
            ErrorData::new(ErrorCode::INVALID_PARAMS, msg, None)
        }
        crate::error::AppError::Conflict(msg) => {
            ErrorData::new(ErrorCode::INVALID_PARAMS, msg, None)
        }
    }
}

fn ok_json(v: &impl serde::Serialize) -> Result<CallToolResult, ErrorData> {
    let text = serde_json::to_string_pretty(v)
        .map_err(|e| ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None))?;
    Ok(CallToolResult::success(vec![Content::text(text)]))
}
