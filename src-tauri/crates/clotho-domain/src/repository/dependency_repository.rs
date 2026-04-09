use rusqlite::Connection;

use crate::error::DomainError;
use crate::tag::{TaskDependency, TaskDependencyDetail};

pub struct DependencyRepository;

impl DependencyRepository {
    pub fn list_for_task(
        conn: &Connection,
        task_id: &str,
    ) -> Result<Vec<TaskDependency>, DomainError> {
        let mut stmt = conn.prepare(
            "SELECT id, predecessor_id, successor_id, dependency_type, created_at
             FROM task_dependencies
             WHERE predecessor_id = ?1 OR successor_id = ?1",
        )?;
        let rows = stmt.query_map([task_id], |row| {
            Ok(TaskDependency {
                id: row.get(0)?,
                predecessor_id: row.get(1)?,
                successor_id: row.get(2)?,
                dependency_type: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let mut dependencies = Vec::new();
        for row in rows {
            dependencies.push(row?);
        }
        Ok(dependencies)
    }

    pub fn list_detailed(
        conn: &Connection,
        task_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<TaskDependencyDetail>, DomainError> {
        if let Some(task_id) = task_id {
            let mut stmt = conn.prepare(
                "SELECT d.id, d.predecessor_id, pred.title, d.successor_id, succ.title,
                        d.dependency_type, d.created_at
                 FROM task_dependencies d
                 JOIN tasks pred ON pred.id = d.predecessor_id AND pred.deleted_at IS NULL
                 JOIN tasks succ ON succ.id = d.successor_id AND succ.deleted_at IS NULL
                 WHERE d.predecessor_id = ?1 OR d.successor_id = ?1
                 ORDER BY d.created_at DESC
                 LIMIT ?2",
            )?;
            let rows = stmt.query_map(rusqlite::params![task_id, limit as i64], |row| {
                Ok(TaskDependencyDetail {
                    id: row.get(0)?,
                    predecessor_id: row.get(1)?,
                    predecessor_title: row.get(2)?,
                    successor_id: row.get(3)?,
                    successor_title: row.get(4)?,
                    dependency_type: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?;

            rows.collect::<Result<Vec<_>, _>>()
                .map_err(DomainError::Database)
        } else {
            let mut stmt = conn.prepare(
                "SELECT d.id, d.predecessor_id, pred.title, d.successor_id, succ.title,
                        d.dependency_type, d.created_at
                 FROM task_dependencies d
                 JOIN tasks pred ON pred.id = d.predecessor_id AND pred.deleted_at IS NULL
                 JOIN tasks succ ON succ.id = d.successor_id AND succ.deleted_at IS NULL
                 ORDER BY d.created_at DESC
                 LIMIT ?1",
            )?;
            let rows = stmt.query_map(rusqlite::params![limit as i64], |row| {
                Ok(TaskDependencyDetail {
                    id: row.get(0)?,
                    predecessor_id: row.get(1)?,
                    predecessor_title: row.get(2)?,
                    successor_id: row.get(3)?,
                    successor_title: row.get(4)?,
                    dependency_type: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?;

            rows.collect::<Result<Vec<_>, _>>()
                .map_err(DomainError::Database)
        }
    }

    pub fn create(
        conn: &Connection,
        predecessor_id: &str,
        successor_id: &str,
        dependency_type: Option<&str>,
    ) -> Result<TaskDependency, DomainError> {
        if predecessor_id == successor_id {
            return Err(DomainError::InvalidInput(
                "a task cannot depend on itself".to_string(),
            ));
        }
        if Self::creates_cycle(conn, predecessor_id, successor_id)? {
            return Err(DomainError::Conflict(
                "dependency would create a cycle".to_string(),
            ));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let dependency_type = dependency_type.unwrap_or("finish_to_start");

        conn.execute(
            "INSERT INTO task_dependencies (id, predecessor_id, successor_id, dependency_type, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&id, predecessor_id, successor_id, dependency_type, &now],
        )
        .map_err(|err| {
            if let rusqlite::Error::SqliteFailure(ref inner, _) = err {
                if inner.code == rusqlite::ffi::ErrorCode::ConstraintViolation {
                    return DomainError::Conflict("dependency already exists".to_string());
                }
            }
            DomainError::Database(err)
        })?;

        Ok(TaskDependency {
            id,
            predecessor_id: predecessor_id.to_string(),
            successor_id: successor_id.to_string(),
            dependency_type: dependency_type.to_string(),
            created_at: now,
        })
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<(), DomainError> {
        let affected = conn.execute("DELETE FROM task_dependencies WHERE id = ?1", [id])?;
        if affected == 0 {
            return Err(DomainError::NotFound(format!("dependency {id}")));
        }
        Ok(())
    }

    fn creates_cycle(
        conn: &Connection,
        predecessor_id: &str,
        successor_id: &str,
    ) -> Result<bool, DomainError> {
        conn.query_row(
            "
            WITH RECURSIVE reachable(id) AS (
                SELECT successor_id
                FROM task_dependencies
                WHERE predecessor_id = ?1
                UNION
                SELECT d.successor_id
                FROM task_dependencies d
                INNER JOIN reachable r ON d.predecessor_id = r.id
            )
            SELECT EXISTS(SELECT 1 FROM reachable WHERE id = ?2)
            ",
            rusqlite::params![successor_id, predecessor_id],
            |row| row.get(0),
        )
        .map_err(DomainError::Database)
    }
}
