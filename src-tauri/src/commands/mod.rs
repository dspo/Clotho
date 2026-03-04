pub mod dependency;
pub mod image;
pub mod mcp;
pub mod project;
pub mod settings;
pub mod tag;
pub mod task;

use crate::error::AppError;
use crate::state::AppState;
use std::sync::MutexGuard;

/// Acquire the database lock, converting mutex poisoning to AppError.
pub fn lock_db(state: &AppState) -> Result<MutexGuard<'_, rusqlite::Connection>, AppError> {
    state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })
}
