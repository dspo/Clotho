use tauri::State;

use crate::commands::lock_db;
use crate::error::AppError;
use crate::models::settings::AppSettings;
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Vec<AppSettings>, AppError> {
    let db = lock_db(&state)?;
    let mut stmt = db.prepare("SELECT key, value, updated_at FROM app_settings")?;
    let rows = stmt.query_map([], |row| {
        Ok(AppSettings {
            key: row.get(0)?,
            value: row.get(1)?,
            updated_at: row.get(2)?,
        })
    })?;
    let mut settings = Vec::new();
    for row in rows {
        settings.push(row?);
    }
    Ok(settings)
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<AppSettings, AppError> {
    let db = lock_db(&state)?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    db.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
        rusqlite::params![&key, &value, &now],
    )?;

    Ok(AppSettings {
        key,
        value,
        updated_at: now,
    })
}
