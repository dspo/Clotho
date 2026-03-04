use tauri::State;

use crate::commands::lock_db;
use crate::error::AppError;
use crate::models::tag::TaskDependency;
use crate::state::AppState;

#[tauri::command]
pub fn list_task_dependencies(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Vec<TaskDependency>, AppError> {
    let db = lock_db(&state)?;
    let mut stmt = db.prepare(
        "SELECT id, predecessor_id, successor_id, dependency_type, created_at
         FROM task_dependencies
         WHERE predecessor_id = ?1 OR successor_id = ?1",
    )?;
    let rows = stmt.query_map([&task_id], |row| {
        Ok(TaskDependency {
            id: row.get(0)?,
            predecessor_id: row.get(1)?,
            successor_id: row.get(2)?,
            dependency_type: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut deps = Vec::new();
    for row in rows {
        deps.push(row?);
    }
    Ok(deps)
}

#[tauri::command]
pub fn create_task_dependency(
    state: State<'_, AppState>,
    predecessor_id: String,
    successor_id: String,
    dependency_type: Option<String>,
) -> Result<TaskDependency, AppError> {
    if predecessor_id == successor_id {
        return Err(AppError::InvalidInput(
            "a task cannot depend on itself".to_string(),
        ));
    }

    let db = lock_db(&state)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let dep_type = dependency_type.unwrap_or_else(|| "finish_to_start".to_string());

    db.execute(
        "INSERT INTO task_dependencies (id, predecessor_id, successor_id, dependency_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![&id, &predecessor_id, &successor_id, &dep_type, &now],
    )
    .map_err(|e| {
        if let rusqlite::Error::SqliteFailure(ref err, _) = e {
            if err.code == rusqlite::ffi::ErrorCode::ConstraintViolation {
                return AppError::Conflict("dependency already exists".to_string());
            }
        }
        AppError::Database(e)
    })?;

    Ok(TaskDependency {
        id,
        predecessor_id,
        successor_id,
        dependency_type: dep_type,
        created_at: now,
    })
}

#[tauri::command]
pub fn delete_task_dependency(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let db = lock_db(&state)?;
    let affected = db.execute("DELETE FROM task_dependencies WHERE id = ?1", [&id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("dependency {id}")));
    }
    Ok(())
}
