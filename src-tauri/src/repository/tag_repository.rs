//! Centralized tag database operations.

use rusqlite::Connection;

use crate::error::AppError;
use crate::models::tag::Tag;

pub struct TagRepository;

impl TagRepository {
    /// List all tags.
    pub fn list(conn: &Connection) -> Result<Vec<Tag>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT id, name, color, created_at FROM tags ORDER BY name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::Database)
    }

    /// Get a single tag by ID.
    pub fn get(conn: &Connection, id: &str) -> Result<Tag, AppError> {
        conn.query_row(
            "SELECT id, name, color, created_at FROM tags WHERE id = ?1",
            [id],
            |row| {
                Ok(Tag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("tag {id}")),
            other => AppError::Database(other),
        })
    }

    /// Create a new tag.
    pub fn create(conn: &Connection, name: &str, color: Option<&str>) -> Result<Tag, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let color = color.unwrap_or("#6B7280");

        conn.execute(
            "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&id, name, color, &now],
        )
        .map_err(|e| {
            if let rusqlite::Error::SqliteFailure(ref err, _) = e {
                if err.code == rusqlite::ffi::ErrorCode::ConstraintViolation {
                    return AppError::Conflict(format!("tag with name '{name}' already exists"));
                }
            }
            AppError::Database(e)
        })?;

        Ok(Tag {
            id,
            name: name.to_string(),
            color: color.to_string(),
            created_at: now,
        })
    }

    /// Update an existing tag.
    pub fn update(
        conn: &Connection,
        id: &str,
        name: Option<&str>,
        color: Option<&str>,
    ) -> Result<Tag, AppError> {
        if let Some(v) = name {
            conn.execute(
                "UPDATE tags SET name = ?1 WHERE id = ?2",
                rusqlite::params![v, id],
            )?;
        }
        if let Some(v) = color {
            conn.execute(
                "UPDATE tags SET color = ?1 WHERE id = ?2",
                rusqlite::params![v, id],
            )?;
        }
        Self::get(conn, id)
    }

    /// Delete a tag and remove it from all tasks.
    pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
        // Remove associations first
        conn.execute("DELETE FROM task_tags WHERE tag_id = ?1", [id])?;
        let affected = conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("tag {id}")));
        }
        Ok(())
    }

    /// Add a tag to a task.
    /// Returns true if the association was created, false if it already existed.
    pub fn add_to_task(conn: &Connection, task_id: &str, tag_id: &str) -> Result<bool, AppError> {
        // Verify task exists
        let task_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [task_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !task_exists {
            return Err(AppError::NotFound(format!("task {task_id}")));
        }

        // Verify tag exists
        let tag_exists: bool = conn
            .query_row("SELECT COUNT(*) > 0 FROM tags WHERE id = ?1", [tag_id], |row| {
                row.get(0)
            })
            .unwrap_or(false);
        if !tag_exists {
            return Err(AppError::NotFound(format!("tag {tag_id}")));
        }

        let affected = conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![task_id, tag_id],
        )?;
        Ok(affected > 0)
    }

    /// Remove a tag from a task.
    pub fn remove_from_task(conn: &Connection, task_id: &str, tag_id: &str) -> Result<(), AppError> {
        conn.execute(
            "DELETE FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
            rusqlite::params![task_id, tag_id],
        )?;
        Ok(())
    }
}
