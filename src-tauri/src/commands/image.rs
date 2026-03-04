use std::fs;
use std::path::PathBuf;
use base64::Engine;
use tauri::{AppHandle, Manager, State};

use crate::commands::lock_db;
use crate::error::AppError;
use crate::models::image::TaskImage;
use crate::state::AppState;

fn images_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InvalidInput(format!("failed to resolve app data dir: {e}")))?
        .join("images");
    fs::create_dir_all(&dir).map_err(|e| {
        AppError::InvalidInput(format!("failed to create images dir: {e}"))
    })?;
    Ok(dir)
}

#[tauri::command]
pub fn upload_task_image(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    filename: String,
    data: Vec<u8>,
    mime_type: String,
) -> Result<TaskImage, AppError> {
    let db = lock_db(&state)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let size = data.len() as i64;

    // Determine file extension from filename
    let ext = filename
        .rsplit('.')
        .next()
        .unwrap_or("bin");
    let stored_filename = format!("{}.{}", id, ext);

    // Write file to disk
    let dir = images_dir(&app)?;
    let file_path = dir.join(&stored_filename);
    fs::write(&file_path, &data).map_err(|e| {
        AppError::InvalidInput(format!("failed to write image file: {e}"))
    })?;

    // Insert metadata into database
    db.execute(
        "INSERT INTO task_images (id, task_id, filename, mime_type, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![&id, &task_id, &filename, &mime_type, &size, &now],
    )?;

    Ok(TaskImage {
        id,
        task_id,
        filename,
        mime_type,
        size,
        created_at: now,
    })
}

#[tauri::command]
pub fn get_task_image(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, AppError> {
    let db = lock_db(&state)?;

    let (filename, _mime_type): (String, String) = db
        .query_row(
            "SELECT filename, mime_type FROM task_images WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("image {id}")),
            other => AppError::Database(other),
        })?;

    // Determine stored filename (id.ext)
    let ext = filename.rsplit('.').next().unwrap_or("bin");
    let stored_filename = format!("{}.{}", id, ext);
    let dir = images_dir(&app)?;
    let file_path = dir.join(&stored_filename);

    let bytes = fs::read(&file_path).map_err(|e| {
        AppError::NotFound(format!("image file not found: {e}"))
    })?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub fn list_task_images(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Vec<TaskImage>, AppError> {
    let db = lock_db(&state)?;
    let mut stmt = db.prepare(
        "SELECT id, task_id, filename, mime_type, size, created_at FROM task_images WHERE task_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([&task_id], |row| {
        Ok(TaskImage {
            id: row.get(0)?,
            task_id: row.get(1)?,
            filename: row.get(2)?,
            mime_type: row.get(3)?,
            size: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let mut images = Vec::new();
    for row in rows {
        images.push(row?);
    }
    Ok(images)
}

#[tauri::command]
pub fn delete_task_image(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let db = lock_db(&state)?;

    // Get filename to delete the file
    let filename: String = db
        .query_row(
            "SELECT filename FROM task_images WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("image {id}")),
            other => AppError::Database(other),
        })?;

    // Delete from database
    db.execute("DELETE FROM task_images WHERE id = ?1", [&id])?;

    // Delete file from disk (best effort)
    let ext = filename.rsplit('.').next().unwrap_or("bin");
    let stored_filename = format!("{}.{}", id, ext);
    let dir = images_dir(&app)?;
    let file_path = dir.join(&stored_filename);
    let _ = fs::remove_file(&file_path);

    Ok(())
}
