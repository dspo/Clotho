use tauri::State;

use crate::commands::lock_db;
use crate::data::{
    CreateTaskInput, ListTasksFilter, TaskData, TaskDetailData, TaskProgressData, TaskWithTagsData, UpdateTaskInput,
};
use crate::error::AppError;
use crate::repository::TaskRepository;
use crate::state::AppState;

#[tauri::command]
pub fn list_tasks(
    state: State<'_, AppState>,
    project_id: Option<String>,
    status_filter: Option<String>,
    priority_filter: Option<String>,
) -> Result<Vec<TaskWithTagsData>, AppError> {
    let db = lock_db(&state)?;
    let filter = ListTasksFilter {
        project_id,
        status: status_filter,
        priority: priority_filter,
    };
    TaskRepository::list(&db, &filter)
}

#[tauri::command]
pub fn get_task(state: State<'_, AppState>, id: String) -> Result<TaskDetailData, AppError> {
    let db = lock_db(&state)?;
    TaskRepository::get_detail(&db, &id)
}

#[tauri::command]
pub fn create_task(
    state: State<'_, AppState>,
    project_id: String,
    title: String,
    description: Option<String>,
    description_format: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    difficulty: Option<String>,
    start_date: Option<String>,
    due_date: Option<String>,
    parent_task_id: Option<String>,
    is_milestone: Option<bool>,
    kanban_order: Option<String>,
    estimated_hours: Option<f64>,
    tag_ids: Option<Vec<String>>,
) -> Result<TaskData, AppError> {
    let db = lock_db(&state)?;
    let input = CreateTaskInput {
        project_id,
        title,
        description,
        description_format,
        status,
        priority,
        difficulty,
        start_date,
        due_date,
        parent_task_id,
        is_milestone,
        kanban_order,
        estimated_hours,
        tag_ids,
    };
    TaskRepository::create(&db, &input)
}

#[tauri::command]
pub fn update_task(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    description_format: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    difficulty: Option<String>,
    start_date: Option<String>,
    due_date: Option<String>,
    parent_task_id: Option<String>,
    is_milestone: Option<bool>,
    kanban_order: Option<String>,
    estimated_hours: Option<f64>,
    actual_hours: Option<f64>,
    tag_ids: Option<Vec<String>>,
    project_id: Option<String>,
) -> Result<TaskData, AppError> {
    let db = lock_db(&state)?;
    let input = UpdateTaskInput {
        title,
        description,
        description_format,
        status,
        priority,
        difficulty,
        start_date,
        due_date,
        parent_task_id,
        is_milestone,
        kanban_order,
        estimated_hours,
        actual_hours,
        tag_ids,
        project_id,
    };
    TaskRepository::update(&db, &id, &input)
}

#[tauri::command]
pub fn delete_task(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = lock_db(&state)?;
    TaskRepository::delete(&db, &id)
}

#[tauri::command]
pub fn reorder_tasks(
    state: State<'_, AppState>,
    task_ids: Vec<String>,
    order_field: String,
) -> Result<(), AppError> {
    let db = lock_db(&state)?;
    TaskRepository::reorder(&db, &task_ids, &order_field)
}

#[tauri::command]
pub fn batch_update_tasks(
    state: State<'_, AppState>,
    task_ids: Vec<String>,
    status: Option<String>,
    priority: Option<String>,
) -> Result<Vec<TaskData>, AppError> {
    let db = lock_db(&state)?;
    TaskRepository::batch_update(&db, &task_ids, status.as_deref(), priority.as_deref())
}

#[tauri::command]
pub fn search_tasks(
    state: State<'_, AppState>,
    query: String,
    project_id: Option<String>,
) -> Result<Vec<TaskWithTagsData>, AppError> {
    let db = lock_db(&state)?;
    TaskRepository::search(&db, &query, project_id.as_deref())
}

#[tauri::command]
pub fn list_task_progress(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Vec<TaskProgressData>, AppError> {
    let db = lock_db(&state)?;
    TaskRepository::list_progress(&db, &task_id)
}

#[tauri::command]
pub fn add_task_progress(
    state: State<'_, AppState>,
    task_id: String,
    content: String,
    content_format: Option<String>,
) -> Result<TaskProgressData, AppError> {
    let db = lock_db(&state)?;
    TaskRepository::add_progress(&db, &task_id, &content, content_format.as_deref())
}
