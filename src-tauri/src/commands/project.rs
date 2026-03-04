use tauri::State;

use crate::error::AppError;
use crate::models::project::{Project, ProjectWithStats};
use crate::repository::ProjectRepository;
use crate::state::AppState;

#[tauri::command]
pub fn list_projects(
    state: State<'_, AppState>,
    status_filter: Option<String>,
) -> Result<Vec<ProjectWithStats>, AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    ProjectRepository::list(&db, status_filter.as_deref())
}

#[tauri::command]
pub fn get_project(state: State<'_, AppState>, id: String) -> Result<Project, AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    ProjectRepository::get(&db, &id)
}

#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    color: Option<String>,
) -> Result<Project, AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    ProjectRepository::create(&db, &name, description.as_deref(), color.as_deref())
}

#[tauri::command]
pub fn update_project(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    status: Option<String>,
) -> Result<Project, AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    ProjectRepository::update(
        &db,
        &id,
        name.as_deref(),
        description.as_deref(),
        color.as_deref(),
        icon.as_deref(),
        status.as_deref(),
    )
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    ProjectRepository::delete(&db, &id)
}

#[tauri::command]
pub fn reorder_projects(
    state: State<'_, AppState>,
    project_ids: Vec<String>,
) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    ProjectRepository::reorder(&db, &project_ids)
}
