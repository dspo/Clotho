use rusqlite::Connection;

use crate::error::DomainError;
use crate::project::{Project, ProjectWithStats};

pub struct ProjectRepository;

impl ProjectRepository {
    pub fn list(
        conn: &Connection,
        status_filter: Option<&str>,
    ) -> Result<Vec<ProjectWithStats>, DomainError> {
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

        rows.collect::<Result<Vec<_>, _>>().map_err(DomainError::Database)
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Project, DomainError> {
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
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => DomainError::NotFound(format!("project {id}")),
            other => DomainError::Database(other),
        })
    }

    pub fn get_with_stats(conn: &Connection, id: &str) -> Result<ProjectWithStats, DomainError> {
        conn.query_row(
            "SELECT p.id, p.name, p.description, p.color, p.icon, p.status, p.sort_order,
                    p.created_at, p.updated_at,
                    COUNT(t.id) AS total_tasks,
                    SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_tasks
             FROM projects p
             LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
             WHERE p.id = ?1 AND p.deleted_at IS NULL
             GROUP BY p.id",
            [id],
            |row| {
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
            },
        )
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => DomainError::NotFound(format!("project {id}")),
            other => DomainError::Database(other),
        })
    }

    pub fn create(
        conn: &Connection,
        name: &str,
        description: Option<&str>,
        color: Option<&str>,
    ) -> Result<Project, DomainError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let color = color.unwrap_or("#3B82F6");

        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM projects WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )
            .map_err(DomainError::Database)?;

        conn.execute(
            "INSERT INTO projects (id, name, description, color, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![&id, name, description, color, max_order + 1, &now, &now],
        )?;

        Ok(Project {
            id,
            name: name.to_string(),
            description: description.map(str::to_string),
            color: Some(color.to_string()),
            icon: None,
            status: "active".to_string(),
            sort_order: max_order + 1,
            created_at: now.clone(),
            updated_at: now,
            deleted_at: None,
        })
    }

    pub fn update(
        conn: &Connection,
        id: &str,
        name: Option<&str>,
        description: Option<&str>,
        color: Option<&str>,
        icon: Option<&str>,
        status: Option<&str>,
    ) -> Result<Project, DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM projects WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .map_err(DomainError::Database)?;

        if !exists {
            return Err(DomainError::NotFound(format!("project {id}")));
        }

        if let Some(value) = name {
            conn.execute(
                "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = description {
            conn.execute(
                "UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = color {
            conn.execute(
                "UPDATE projects SET color = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = icon {
            conn.execute(
                "UPDATE projects SET icon = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = status {
            conn.execute(
                "UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }

        Self::get(conn, id)
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<(), DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let affected = conn.execute(
            "UPDATE projects SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        if affected == 0 {
            return Err(DomainError::NotFound(format!("project {id}")));
        }
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE project_id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        Ok(())
    }

    pub fn reorder(conn: &Connection, project_ids: &[String]) -> Result<(), DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        for (index, project_id) in project_ids.iter().enumerate() {
            conn.execute(
                "UPDATE projects SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![index as i32, &now, project_id],
            )?;
        }
        Ok(())
    }
}
