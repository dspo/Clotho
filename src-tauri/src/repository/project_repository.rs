//! Centralized project database operations.

use rusqlite::Connection;

use crate::error::AppError;
use crate::models::project::{Project, ProjectWithStats};

pub struct ProjectRepository;

impl ProjectRepository {
    /// List projects with optional status filter.
    pub fn list(conn: &Connection, status_filter: Option<&str>) -> Result<Vec<ProjectWithStats>, AppError> {
        let status = status_filter.unwrap_or("active");

        let mut stmt = conn.prepare(
            "SELECT p.id, p.name, p.description, p.color, p.icon, p.status, p.sort_order,
                    p.created_at, p.updated_at,
                    COUNT(t.id) AS total_tasks,
                    SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_tasks
             FROM projects p
             LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
             WHERE p.deleted_at IS NULL AND p.status = ?1
             GROUP BY p.id
             ORDER BY p.sort_order ASC, p.created_at DESC",
        )?;

        let rows = stmt.query_map([status], |row| {
            Ok(ProjectWithStats {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                status: row.get(5)?,
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                total_tasks: row.get(9)?,
                completed_tasks: row.get::<_, Option<i32>>(10)?.unwrap_or(0),
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::Database)
    }

    /// Get a single project by ID.
    pub fn get(conn: &Connection, id: &str) -> Result<Project, AppError> {
        conn.query_row(
            "SELECT id, name, description, color, icon, status, sort_order,
                    created_at, updated_at, deleted_at
             FROM projects WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    color: row.get(3)?,
                    icon: row.get(4)?,
                    status: row.get(5)?,
                    sort_order: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    deleted_at: row.get(9)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("project {id}")),
            other => AppError::Database(other),
        })
    }

    /// Create a new project.
    pub fn create(
        conn: &Connection,
        name: &str,
        description: Option<&str>,
        color: Option<&str>,
    ) -> Result<Project, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let color = color.unwrap_or("#3B82F6");

        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM projects WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap_or(-1);

        conn.execute(
            "INSERT INTO projects (id, name, description, color, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![&id, name, description, color, max_order + 1, &now, &now],
        )?;

        Ok(Project {
            id,
            name: name.to_string(),
            description: description.map(String::from),
            color: Some(color.to_string()),
            icon: None,
            status: "active".to_string(),
            sort_order: max_order + 1,
            created_at: now.clone(),
            updated_at: now,
            deleted_at: None,
        })
    }

    /// Update an existing project.
    pub fn update(
        conn: &Connection,
        id: &str,
        name: Option<&str>,
        description: Option<&str>,
        color: Option<&str>,
        icon: Option<&str>,
        status: Option<&str>,
    ) -> Result<Project, AppError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        // Verify existence
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM projects WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !exists {
            return Err(AppError::NotFound(format!("project {id}")));
        }

        if let Some(v) = name {
            conn.execute(
                "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(v) = description {
            conn.execute(
                "UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(v) = color {
            conn.execute(
                "UPDATE projects SET color = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(v) = icon {
            conn.execute(
                "UPDATE projects SET icon = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(v) = status {
            conn.execute(
                "UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }

        Self::get(conn, id)
    }

    /// Soft-delete a project and its tasks.
    pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let affected = conn.execute(
            "UPDATE projects SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("project {id}")));
        }
        // Soft-delete all tasks in the project
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE project_id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        Ok(())
    }

    /// Reorder projects by updating sort_order.
    pub fn reorder(conn: &Connection, project_ids: &[String]) -> Result<(), AppError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        for (i, pid) in project_ids.iter().enumerate() {
            conn.execute(
                "UPDATE projects SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![i as i32, &now, pid],
            )?;
        }
        Ok(())
    }
}
