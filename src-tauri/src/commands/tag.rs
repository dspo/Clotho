use tauri::State;

use crate::error::AppError;
use crate::models::tag::Tag;
use crate::repository::TagRepository;
use crate::state::AppState;

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    TagRepository::list(&db)
}

#[tauri::command]
pub fn create_tag(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> Result<Tag, AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    TagRepository::create(&db, &name, color.as_deref())
}

#[tauri::command]
pub fn update_tag(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<Tag, AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    TagRepository::update(&db, &id, name.as_deref(), color.as_deref())
}

#[tauri::command]
pub fn delete_tag(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    TagRepository::delete(&db, &id)
}

#[tauri::command]
pub fn add_task_tag(
    state: State<'_, AppState>,
    task_id: String,
    tag_id: String,
) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    TagRepository::add_to_task(&db, &task_id, &tag_id)?;
    Ok(())
}

#[tauri::command]
pub fn remove_task_tag(
    state: State<'_, AppState>,
    task_id: String,
    tag_id: String,
) -> Result<(), AppError> {
    let db = state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    TagRepository::remove_from_task(&db, &task_id, &tag_id)
}
