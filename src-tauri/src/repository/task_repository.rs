//! Centralized task database operations.
//!
//! This module provides a single source of truth for all task-related SQL queries,
//! eliminating duplication between Tauri commands and MCP tools.

use std::collections::HashMap;
use rusqlite::Connection;

use crate::data::{
    CreateTaskInput, ListTasksFilter, TaskData, TaskDetailData, TaskWithTagsData, UpdateTaskInput,
};
use crate::error::AppError;
use crate::models::tag::Tag;

/// Field list for task queries - single source of truth.
const TASK_FIELDS: &str = "id, project_id, parent_task_id, title, description, description_format, \
    status, priority, difficulty, start_date, due_date, completed_at, is_milestone, sort_order, kanban_order, \
    estimated_hours, actual_hours, created_at, updated_at";

pub struct TaskRepository;

impl TaskRepository {
    /// List tasks with optional filters.
    /// Uses batch tag loading to avoid N+1 queries.
    pub fn list(conn: &Connection, filter: &ListTasksFilter) -> Result<Vec<TaskWithTagsData>, AppError> {
        let mut sql = format!(
            "SELECT {TASK_FIELDS} FROM tasks WHERE deleted_at IS NULL"
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut idx = 1usize;

        if let Some(ref pid) = filter.project_id {
            sql.push_str(&format!(" AND project_id = ?{idx}"));
            params.push(Box::new(pid.clone()));
            idx += 1;
        }
        if let Some(ref s) = filter.status {
            sql.push_str(&format!(" AND status = ?{idx}"));
            params.push(Box::new(s.clone()));
            idx += 1;
        }
        if let Some(ref p) = filter.priority {
            sql.push_str(&format!(" AND priority = ?{idx}"));
            params.push(Box::new(p.clone()));
        }
        let _ = idx; // silence unused warning
        sql.push_str(" ORDER BY sort_order ASC, created_at ASC");

        let mut stmt = conn.prepare(&sql)?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(refs.as_slice(), row_to_task_data)?;

        let mut tasks: Vec<TaskData> = Vec::new();
        for row in rows {
            tasks.push(row?);
        }

        // Batch load tags for all tasks (avoids N+1)
        let task_ids: Vec<&str> = tasks.iter().map(|t| t.id.as_str()).collect();
        let tags_map = Self::get_tags_for_tasks_batch(conn, &task_ids)?;

        let results = tasks
            .into_iter()
            .map(|task| {
                let tags = tags_map.get(&task.id).cloned().unwrap_or_default();
                TaskWithTagsData { task, tags }
            })
            .collect();

        Ok(results)
    }

    /// Get a single task by ID.
    pub fn get(conn: &Connection, id: &str) -> Result<TaskData, AppError> {
        conn.query_row(
            &format!("SELECT {TASK_FIELDS} FROM tasks WHERE id = ?1 AND deleted_at IS NULL"),
            [id],
            row_to_task_data,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("task {id}")),
            other => AppError::Database(other),
        })
    }

    /// Get a task with full details including tags and subtasks.
    pub fn get_detail(conn: &Connection, id: &str) -> Result<TaskDetailData, AppError> {
        let task = Self::get(conn, id)?;
        let tags = Self::get_tags_for_task(conn, id)?;
        let subtasks = Self::get_subtasks(conn, id)?;
        Ok(TaskDetailData { task, tags, subtasks })
    }

    /// Create a new task.
    pub fn create(conn: &Connection, input: &CreateTaskInput) -> Result<TaskData, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let status = input.status.as_deref().unwrap_or("todo");
        let priority = input.priority.as_deref().unwrap_or("low");
        let is_milestone = input.is_milestone.unwrap_or(false);
        let kanban_order = input.kanban_order.as_deref().unwrap_or("");

        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE project_id = ?1 AND deleted_at IS NULL",
                [&input.project_id],
                |row| row.get(0),
            )
            .map_err(AppError::Database)?;

        conn.execute(
            "INSERT INTO tasks (id, project_id, parent_task_id, title, description, description_format, \
                status, priority, difficulty, start_date, due_date, is_milestone, sort_order, kanban_order, \
                estimated_hours, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            rusqlite::params![
                &id,
                &input.project_id,
                &input.parent_task_id,
                &input.title,
                &input.description,
                &input.description_format,
                status,
                priority,
                &input.difficulty,
                &input.start_date,
                &input.due_date,
                is_milestone,
                max_order + 1,
                kanban_order,
                &input.estimated_hours,
                &now,
                &now,
            ],
        )?;

        // Add tags if provided
        if let Some(ref tag_ids) = input.tag_ids {
            for tag_id in tag_ids {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![&id, tag_id],
                );
            }
        }

        Self::get(conn, &id)
    }

    /// Update an existing task.
    pub fn update(conn: &Connection, id: &str, input: &UpdateTaskInput) -> Result<TaskData, AppError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        // Verify existence
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .map_err(AppError::Database)?;
        if !exists {
            return Err(AppError::NotFound(format!("task {id}")));
        }

        if let Some(ref v) = input.title {
            conn.execute(
                "UPDATE tasks SET title = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.description {
            conn.execute(
                "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.description_format {
            conn.execute(
                "UPDATE tasks SET description_format = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.status {
            let completed_at = if v == "done" { Some(now.clone()) } else { None };
            conn.execute(
                "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![v, &completed_at, &now, id],
            )?;
        }
        if let Some(ref v) = input.priority {
            conn.execute(
                "UPDATE tasks SET priority = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.difficulty {
            conn.execute(
                "UPDATE tasks SET difficulty = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.start_date {
            conn.execute(
                "UPDATE tasks SET start_date = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.due_date {
            conn.execute(
                "UPDATE tasks SET due_date = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.parent_task_id {
            conn.execute(
                "UPDATE tasks SET parent_task_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(v) = input.is_milestone {
            conn.execute(
                "UPDATE tasks SET is_milestone = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.kanban_order {
            conn.execute(
                "UPDATE tasks SET kanban_order = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(v) = input.estimated_hours {
            conn.execute(
                "UPDATE tasks SET estimated_hours = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(v) = input.actual_hours {
            conn.execute(
                "UPDATE tasks SET actual_hours = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref v) = input.project_id {
            conn.execute(
                "UPDATE tasks SET project_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![v, &now, id],
            )?;
        }
        if let Some(ref tag_ids) = input.tag_ids {
            conn.execute("DELETE FROM task_tags WHERE task_id = ?1", [id])?;
            for tag_id in tag_ids {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![id, tag_id],
                );
            }
        }

        Self::get(conn, id)
    }

    /// Soft-delete a task and its subtasks.
    pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let affected = conn.execute(
            "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("task {id}")));
        }
        // Soft-delete subtasks
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE parent_task_id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        Ok(())
    }

    /// Search tasks by title or description.
    /// Uses batch tag loading to avoid N+1 queries.
    pub fn search(
        conn: &Connection,
        query: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<TaskWithTagsData>, AppError> {
        let pattern = format!("%{query}%");
        let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(pid) = project_id {
            (
                format!(
                    "SELECT {TASK_FIELDS} FROM tasks \
                     WHERE deleted_at IS NULL AND project_id = ?1 \
                       AND (LOWER(title) LIKE LOWER(?2) OR LOWER(description) LIKE LOWER(?2)) \
                     ORDER BY updated_at DESC LIMIT 50"
                ),
                vec![Box::new(pid.to_string()), Box::new(pattern)],
            )
        } else {
            (
                format!(
                    "SELECT {TASK_FIELDS} FROM tasks \
                     WHERE deleted_at IS NULL \
                       AND (LOWER(title) LIKE LOWER(?1) OR LOWER(description) LIKE LOWER(?1)) \
                     ORDER BY updated_at DESC LIMIT 50"
                ),
                vec![Box::new(pattern)],
            )
        };

        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(refs.as_slice(), row_to_task_data)?;

        let mut tasks: Vec<TaskData> = Vec::new();
        for row in rows {
            tasks.push(row?);
        }

        // Batch load tags for all tasks (avoids N+1)
        let task_ids: Vec<&str> = tasks.iter().map(|t| t.id.as_str()).collect();
        let tags_map = Self::get_tags_for_tasks_batch(conn, &task_ids)?;

        let results = tasks
            .into_iter()
            .map(|task| {
                let tags = tags_map.get(&task.id).cloned().unwrap_or_default();
                TaskWithTagsData { task, tags }
            })
            .collect();

        Ok(results)
    }

    /// Reorder tasks by updating sort_order or kanban_order.
    pub fn reorder(
        conn: &Connection,
        task_ids: &[String],
        order_field: &str,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let field = match order_field {
            "sort_order" | "kanban_order" => order_field,
            _ => return Err(AppError::InvalidInput(format!("invalid order field: {order_field}"))),
        };

        if field == "kanban_order" {
            for (i, tid) in task_ids.iter().enumerate() {
                let order = format!("a{i}");
                conn.execute(
                    &format!("UPDATE tasks SET {field} = ?1, updated_at = ?2 WHERE id = ?3"),
                    rusqlite::params![&order, &now, tid],
                )?;
            }
        } else {
            for (i, tid) in task_ids.iter().enumerate() {
                conn.execute(
                    &format!("UPDATE tasks SET {field} = ?1, updated_at = ?2 WHERE id = ?3"),
                    rusqlite::params![i as i32, &now, tid],
                )?;
            }
        }
        Ok(())
    }

    /// Batch update multiple tasks.
    pub fn batch_update(
        conn: &Connection,
        task_ids: &[String],
        status: Option<&str>,
        priority: Option<&str>,
    ) -> Result<Vec<TaskData>, AppError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        for tid in task_ids {
            if let Some(s) = status {
                let completed_at = if s == "done" { Some(now.clone()) } else { None };
                conn.execute(
                    "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4 AND deleted_at IS NULL",
                    rusqlite::params![s, &completed_at, &now, tid],
                )?;
            }
            if let Some(p) = priority {
                conn.execute(
                    "UPDATE tasks SET priority = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                    rusqlite::params![p, &now, tid],
                )?;
            }
        }

        let mut results = Vec::new();
        for tid in task_ids {
            results.push(Self::get(conn, tid)?);
        }
        Ok(results)
    }

    /// Get tags associated with a task.
    pub fn get_tags_for_task(conn: &Connection, task_id: &str) -> Result<Vec<Tag>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color, t.created_at \
             FROM tags t \
             INNER JOIN task_tags tt ON tt.tag_id = t.id \
             WHERE tt.task_id = ?1",
        )?;
        let rows = stmt.query_map([task_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        let mut tags = Vec::new();
        for row in rows {
            tags.push(row?);
        }
        Ok(tags)
    }

    /// Batch get tags for multiple tasks (avoids N+1 queries).
    fn get_tags_for_tasks_batch(
        conn: &Connection,
        task_ids: &[&str],
    ) -> Result<HashMap<String, Vec<Tag>>, AppError> {
        if task_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Build placeholders for IN clause
        let placeholders: Vec<String> = (1..=task_ids.len()).map(|i| format!("?{i}")).collect();
        let sql = format!(
            "SELECT tt.task_id, t.id, t.name, t.color, t.created_at \
             FROM tags t \
             INNER JOIN task_tags tt ON tt.tag_id = t.id \
             WHERE tt.task_id IN ({})",
            placeholders.join(", ")
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::types::ToSql> =
            task_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?, // task_id
                Tag {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                    created_at: row.get(4)?,
                },
            ))
        })?;

        let mut map: HashMap<String, Vec<Tag>> = HashMap::new();
        for row in rows {
            let (task_id, tag) = row?;
            map.entry(task_id).or_default().push(tag);
        }
        Ok(map)
    }

    /// Get subtasks for a parent task.
    fn get_subtasks(conn: &Connection, parent_id: &str) -> Result<Vec<TaskData>, AppError> {
        let mut stmt = conn.prepare(&format!(
            "SELECT {TASK_FIELDS} FROM tasks \
             WHERE parent_task_id = ?1 AND deleted_at IS NULL \
             ORDER BY sort_order ASC"
        ))?;
        let rows = stmt.query_map([parent_id], row_to_task_data)?;
        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row?);
        }
        Ok(tasks)
    }
}

/// Map a database row to TaskData.
fn row_to_task_data(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskData> {
    Ok(TaskData {
        id: row.get(0)?,
        project_id: row.get(1)?,
        parent_task_id: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        description_format: row.get(5)?,
        status: row.get(6)?,
        priority: row.get(7)?,
        difficulty: row.get(8)?,
        start_date: row.get(9)?,
        due_date: row.get(10)?,
        completed_at: row.get(11)?,
        is_milestone: row.get(12)?,
        sort_order: row.get(13)?,
        kanban_order: row.get(14)?,
        estimated_hours: row.get(15)?,
        actual_hours: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}
