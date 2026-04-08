use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::{Error, Result};

const DB_FILE_NAME: &str = "clotho.db";

pub fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|err| {
        Error::InvalidInput(format!("failed to resolve app data dir: {err}"))
    })?;
    fs::create_dir_all(&dir).map_err(|err| {
        Error::InvalidInput(format!("failed to create app data dir: {err}"))
    })?;
    Ok(dir)
}

pub fn open_connection<R: Runtime>(app: &AppHandle<R>) -> Result<Connection> {
    let db_path = app_data_dir(app)?.join(DB_FILE_NAME);
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        ",
    )?;
    Ok(conn)
}
