use rusqlite::Connection;

use crate::error::DomainError;
use crate::image::TaskImage;

pub struct ImageRepository;

impl ImageRepository {
    pub fn create(
        conn: &Connection,
        task_id: &str,
        filename: &str,
        mime_type: &str,
        size: i64,
    ) -> Result<TaskImage, DomainError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "INSERT INTO task_images (id, task_id, filename, mime_type, size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![&id, task_id, filename, mime_type, size, &now],
        )?;

        Ok(TaskImage {
            id,
            task_id: task_id.to_string(),
            filename: filename.to_string(),
            mime_type: mime_type.to_string(),
            size,
            created_at: now,
        })
    }

    pub fn list_for_task(
        conn: &Connection,
        task_id: &str,
    ) -> Result<Vec<TaskImage>, DomainError> {
        let mut stmt = conn.prepare(
            "SELECT id, task_id, filename, mime_type, size, created_at
             FROM task_images
             WHERE task_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([task_id], |row| {
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

    pub fn get(conn: &Connection, id: &str) -> Result<TaskImage, DomainError> {
        conn.query_row(
            "SELECT id, task_id, filename, mime_type, size, created_at
             FROM task_images
             WHERE id = ?1",
            [id],
            |row| {
                Ok(TaskImage {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    filename: row.get(2)?,
                    mime_type: row.get(3)?,
                    size: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => DomainError::NotFound(format!("image {id}")),
            other => DomainError::Database(other),
        })
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<TaskImage, DomainError> {
        let image = Self::get(conn, id)?;
        let affected = conn.execute("DELETE FROM task_images WHERE id = ?1", [id])?;
        if affected == 0 {
            return Err(DomainError::NotFound(format!("image {id}")));
        }
        Ok(image)
    }
}
