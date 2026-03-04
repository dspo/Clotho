use rusqlite::Connection;
use std::path::PathBuf;

use super::migrations;

pub fn initialize_db(app_data_dir: PathBuf) -> Result<Connection, rusqlite::Error> {
    std::fs::create_dir_all(&app_data_dir).ok();
    let db_path = app_data_dir.join("clotho.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        ",
    )?;

    migrations::run_migrations(&conn)?;

    Ok(conn)
}
