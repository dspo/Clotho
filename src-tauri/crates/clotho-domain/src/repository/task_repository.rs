use std::collections::HashMap;

use rusqlite::Connection;

use crate::error::DomainError;
use crate::tag::Tag;
use crate::task::{
    CreateTaskInput, ListTasksFilter, ScheduleStats, TaskData, TaskDetailData, TaskPatchInput,
    TaskProgressData, TaskWithTagsData, UpdateTaskInput,
};

const TASK_FIELDS: &str = "id, project_id, parent_task_id, title, description, description_format, \
    status, priority, difficulty, start_date, due_date, completed_at, is_milestone, sort_order, kanban_order, \
    estimated_hours, actual_hours, created_at, updated_at";

pub struct TaskRepository;

impl TaskRepository {
    pub fn list(
        conn: &Connection,
        filter: &ListTasksFilter,
    ) -> Result<Vec<TaskWithTagsData>, DomainError> {
        Self::list_limited(conn, filter, None)
    }

    pub fn list_limited(
        conn: &Connection,
        filter: &ListTasksFilter,
        limit: Option<usize>,
    ) -> Result<Vec<TaskWithTagsData>, DomainError> {
        let mut sql = format!("SELECT {TASK_FIELDS} FROM tasks WHERE deleted_at IS NULL");
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let mut idx = 1usize;

        if let Some(ref project_id) = filter.project_id {
            sql.push_str(&format!(" AND project_id = ?{idx}"));
            params.push(Box::new(project_id.clone()));
            idx += 1;
        }
        if let Some(ref status) = filter.status {
            sql.push_str(&format!(" AND status = ?{idx}"));
            params.push(Box::new(status.clone()));
            idx += 1;
        }
        if let Some(ref priority) = filter.priority {
            sql.push_str(&format!(" AND priority = ?{idx}"));
            params.push(Box::new(priority.clone()));
            idx += 1;
        }

        sql.push_str(" ORDER BY sort_order ASC, created_at ASC");
        if let Some(limit) = limit {
            sql.push_str(&format!(" LIMIT ?{idx}"));
            params.push(Box::new(limit as i64));
        }

        let mut stmt = conn.prepare(&sql)?;
        let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|param| param.as_ref()).collect();
        let rows = stmt.query_map(refs.as_slice(), row_to_task_data)?;

        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row?);
        }

        let task_ids: Vec<&str> = tasks.iter().map(|task| task.id.as_str()).collect();
        let tags_map = Self::get_tags_for_tasks_batch(conn, &task_ids)?;

        Ok(tasks
            .into_iter()
            .map(|task| TaskWithTagsData {
                tags: tags_map.get(&task.id).cloned().unwrap_or_default(),
                task,
            })
            .collect())
    }

    pub fn get(conn: &Connection, id: &str) -> Result<TaskData, DomainError> {
        conn.query_row(
            &format!("SELECT {TASK_FIELDS} FROM tasks WHERE id = ?1 AND deleted_at IS NULL"),
            [id],
            row_to_task_data,
        )
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => DomainError::NotFound(format!("task {id}")),
            other => DomainError::Database(other),
        })
    }

    pub fn get_detail(conn: &Connection, id: &str) -> Result<TaskDetailData, DomainError> {
        let task = Self::get(conn, id)?;
        let tags = Self::get_tags_for_task(conn, id)?;
        let subtasks = Self::get_subtasks(conn, id)?;
        Ok(TaskDetailData {
            task,
            tags,
            subtasks,
        })
    }

    pub fn list_progress(
        conn: &Connection,
        task_id: &str,
    ) -> Result<Vec<TaskProgressData>, DomainError> {
        Self::list_progress_limited(conn, task_id, None)
    }

    pub fn list_progress_limited(
        conn: &Connection,
        task_id: &str,
        limit: Option<usize>,
    ) -> Result<Vec<TaskProgressData>, DomainError> {
        let sql = if limit.is_some() {
            "SELECT id, task_id, content, content_format, created_at \
             FROM task_progress \
             WHERE task_id = ?1 \
             ORDER BY created_at DESC \
             LIMIT ?2"
        } else {
            "SELECT id, task_id, content, content_format, created_at \
             FROM task_progress \
             WHERE task_id = ?1 \
             ORDER BY created_at DESC"
        };
        let mut stmt = conn.prepare(sql)?;
        let mut progress = Vec::new();
        if let Some(limit) = limit {
            let rows = stmt.query_map(rusqlite::params![task_id, limit as i64], row_to_task_progress_data)?;
            for row in rows {
                progress.push(row?);
            }
        } else {
            let rows = stmt.query_map([task_id], row_to_task_progress_data)?;
            for row in rows {
                progress.push(row?);
            }
        }
        Ok(progress)
    }

    pub fn add_progress(
        conn: &Connection,
        task_id: &str,
        content: &str,
        content_format: Option<&str>,
    ) -> Result<TaskProgressData, DomainError> {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [task_id],
                |row| row.get(0),
            )
            .map_err(DomainError::Database)?;
        if !exists {
            return Err(DomainError::NotFound(format!("task {task_id}")));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        conn.execute(
            "INSERT INTO task_progress (id, task_id, content, content_format, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&id, task_id, content, &content_format, &now],
        )?;

        Ok(TaskProgressData {
            id,
            task_id: task_id.to_string(),
            content: content.to_string(),
            content_format: content_format.map(str::to_string),
            created_at: now,
        })
    }

    pub fn create(conn: &Connection, input: &CreateTaskInput) -> Result<TaskData, DomainError> {
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
            .map_err(DomainError::Database)?;

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

    pub fn update(
        conn: &Connection,
        id: &str,
        input: &UpdateTaskInput,
    ) -> Result<TaskData, DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .map_err(DomainError::Database)?;
        if !exists {
            return Err(DomainError::NotFound(format!("task {id}")));
        }

        if let Some(ref value) = input.title {
            conn.execute(
                "UPDATE tasks SET title = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.description {
            conn.execute(
                "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.description_format {
            conn.execute(
                "UPDATE tasks SET description_format = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.status {
            let completed_at = if value == "done" { Some(now.clone()) } else { None };
            conn.execute(
                "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![value, &completed_at, &now, id],
            )?;
        }
        if let Some(ref value) = input.priority {
            conn.execute(
                "UPDATE tasks SET priority = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.difficulty {
            conn.execute(
                "UPDATE tasks SET difficulty = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.start_date {
            conn.execute(
                "UPDATE tasks SET start_date = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.due_date {
            conn.execute(
                "UPDATE tasks SET due_date = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.parent_task_id {
            conn.execute(
                "UPDATE tasks SET parent_task_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = input.is_milestone {
            conn.execute(
                "UPDATE tasks SET is_milestone = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.kanban_order {
            conn.execute(
                "UPDATE tasks SET kanban_order = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = input.estimated_hours {
            conn.execute(
                "UPDATE tasks SET estimated_hours = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = input.actual_hours {
            conn.execute(
                "UPDATE tasks SET actual_hours = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.project_id {
            conn.execute(
                "UPDATE tasks SET project_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
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

    pub fn patch(
        conn: &Connection,
        id: &str,
        input: &TaskPatchInput,
    ) -> Result<TaskData, DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |row| row.get(0),
            )
            .map_err(DomainError::Database)?;
        if !exists {
            return Err(DomainError::NotFound(format!("task {id}")));
        }

        let clear_dates = input.status.as_deref() == Some("unscheduled");
        let start_date_patch = if clear_dates && input.start_date.is_none() {
            Some(None)
        } else {
            input.start_date.clone()
        };
        let due_date_patch = if clear_dates && input.due_date.is_none() {
            Some(None)
        } else {
            input.due_date.clone()
        };

        if let Some(ref value) = input.title {
            conn.execute(
                "UPDATE tasks SET title = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.description {
            conn.execute(
                "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.description_format {
            conn.execute(
                "UPDATE tasks SET description_format = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.status {
            let completed_at = if value == "done" {
                Some(now.clone())
            } else {
                None
            };
            conn.execute(
                "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![value, &completed_at, &now, id],
            )?;
        }
        if let Some(ref value) = input.priority {
            conn.execute(
                "UPDATE tasks SET priority = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.difficulty {
            conn.execute(
                "UPDATE tasks SET difficulty = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = start_date_patch {
            conn.execute(
                "UPDATE tasks SET start_date = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = due_date_patch {
            conn.execute(
                "UPDATE tasks SET due_date = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.parent_task_id {
            conn.execute(
                "UPDATE tasks SET parent_task_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(value) = input.is_milestone {
            conn.execute(
                "UPDATE tasks SET is_milestone = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.kanban_order {
            conn.execute(
                "UPDATE tasks SET kanban_order = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.estimated_hours {
            conn.execute(
                "UPDATE tasks SET estimated_hours = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.actual_hours {
            conn.execute(
                "UPDATE tasks SET actual_hours = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
            )?;
        }
        if let Some(ref value) = input.project_id {
            conn.execute(
                "UPDATE tasks SET project_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, &now, id],
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

    pub fn delete(conn: &Connection, id: &str) -> Result<(), DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let affected = conn.execute(
            "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        if affected == 0 {
            return Err(DomainError::NotFound(format!("task {id}")));
        }
        conn.execute(
            "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE parent_task_id = ?2 AND deleted_at IS NULL",
            rusqlite::params![&now, id],
        )?;
        Ok(())
    }

    pub fn search(
        conn: &Connection,
        query: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<TaskWithTagsData>, DomainError> {
        Self::search_limited(conn, query, project_id, 50)
    }

    pub fn search_limited(
        conn: &Connection,
        query: &str,
        project_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<TaskWithTagsData>, DomainError> {
        let pattern = format!("%{query}%");
        let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(project_id) = project_id {
            (
                format!(
                    "SELECT {TASK_FIELDS} FROM tasks \
                     WHERE deleted_at IS NULL AND project_id = ?1 \
                       AND (LOWER(title) LIKE LOWER(?2) OR LOWER(description) LIKE LOWER(?2)) \
                     ORDER BY updated_at DESC LIMIT ?3"
                ),
                vec![
                    Box::new(project_id.to_string()),
                    Box::new(pattern),
                    Box::new(limit as i64),
                ],
            )
        } else {
            (
                format!(
                    "SELECT {TASK_FIELDS} FROM tasks \
                     WHERE deleted_at IS NULL \
                       AND (LOWER(title) LIKE LOWER(?1) OR LOWER(description) LIKE LOWER(?1)) \
                     ORDER BY updated_at DESC LIMIT ?2"
                ),
                vec![Box::new(pattern), Box::new(limit as i64)],
            )
        };

        let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|param| param.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(refs.as_slice(), row_to_task_data)?;

        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row?);
        }

        let task_ids: Vec<&str> = tasks.iter().map(|task| task.id.as_str()).collect();
        let tags_map = Self::get_tags_for_tasks_batch(conn, &task_ids)?;

        Ok(tasks
            .into_iter()
            .map(|task| TaskWithTagsData {
                tags: tags_map.get(&task.id).cloned().unwrap_or_default(),
                task,
            })
            .collect())
    }

    pub fn reorder(
        conn: &Connection,
        task_ids: &[String],
        order_field: &str,
    ) -> Result<(), DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let field = match order_field {
            "sort_order" | "kanban_order" => order_field,
            _ => {
                return Err(DomainError::InvalidInput(format!(
                    "invalid order field: {order_field}"
                )))
            }
        };

        if field == "kanban_order" {
            for (index, task_id) in task_ids.iter().enumerate() {
                let order = format!("a{index}");
                conn.execute(
                    &format!("UPDATE tasks SET {field} = ?1, updated_at = ?2 WHERE id = ?3"),
                    rusqlite::params![&order, &now, task_id],
                )?;
            }
        } else {
            for (index, task_id) in task_ids.iter().enumerate() {
                conn.execute(
                    &format!("UPDATE tasks SET {field} = ?1, updated_at = ?2 WHERE id = ?3"),
                    rusqlite::params![index as i32, &now, task_id],
                )?;
            }
        }
        Ok(())
    }

    pub fn batch_update(
        conn: &Connection,
        task_ids: &[String],
        status: Option<&str>,
        priority: Option<&str>,
    ) -> Result<Vec<TaskData>, DomainError> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        for task_id in task_ids {
            if let Some(status) = status {
                let completed_at = if status == "done" { Some(now.clone()) } else { None };
                conn.execute(
                    "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4 AND deleted_at IS NULL",
                    rusqlite::params![status, &completed_at, &now, task_id],
                )?;
            }
            if let Some(priority) = priority {
                conn.execute(
                    "UPDATE tasks SET priority = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
                    rusqlite::params![priority, &now, task_id],
                )?;
            }
        }

        let mut results = Vec::new();
        for task_id in task_ids {
            results.push(Self::get(conn, task_id)?);
        }
        Ok(results)
    }

    pub fn get_tags_for_task(conn: &Connection, task_id: &str) -> Result<Vec<Tag>, DomainError> {
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

    pub fn get_schedule_stats(
        conn: &Connection,
        project_id: Option<&str>,
    ) -> Result<ScheduleStats, DomainError> {
        if let Some(project_id) = project_id {
            conn.query_row(
                "SELECT
                    COUNT(*) AS total_tasks,
                    SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
                    SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_tasks,
                    SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo_tasks,
                    SUM(CASE WHEN status = 'unscheduled' THEN 1 ELSE 0 END) AS unscheduled_tasks,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_tasks,
                    SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) < date('now') AND status NOT IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS overdue_tasks,
                    SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) = date('now') AND status NOT IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS due_today_tasks
                 FROM tasks
                 WHERE deleted_at IS NULL AND project_id = ?1",
                [project_id],
                |row| {
                    Ok(ScheduleStats {
                        project_id: Some(project_id.to_string()),
                        total_tasks: row.get(0)?,
                        done_tasks: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                        in_progress_tasks: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                        todo_tasks: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                        unscheduled_tasks: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                        cancelled_tasks: row.get::<_, Option<i64>>(5)?.unwrap_or(0),
                        overdue_tasks: row.get::<_, Option<i64>>(6)?.unwrap_or(0),
                        due_today_tasks: row.get::<_, Option<i64>>(7)?.unwrap_or(0),
                    })
                },
            )
            .map_err(DomainError::Database)
        } else {
            conn.query_row(
                "SELECT
                    COUNT(*) AS total_tasks,
                    SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
                    SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_tasks,
                    SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo_tasks,
                    SUM(CASE WHEN status = 'unscheduled' THEN 1 ELSE 0 END) AS unscheduled_tasks,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_tasks,
                    SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) < date('now') AND status NOT IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS overdue_tasks,
                    SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) = date('now') AND status NOT IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS due_today_tasks
                 FROM tasks
                 WHERE deleted_at IS NULL",
                [],
                |row| {
                    Ok(ScheduleStats {
                        project_id: None,
                        total_tasks: row.get(0)?,
                        done_tasks: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                        in_progress_tasks: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                        todo_tasks: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                        unscheduled_tasks: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                        cancelled_tasks: row.get::<_, Option<i64>>(5)?.unwrap_or(0),
                        overdue_tasks: row.get::<_, Option<i64>>(6)?.unwrap_or(0),
                        due_today_tasks: row.get::<_, Option<i64>>(7)?.unwrap_or(0),
                    })
                },
            )
            .map_err(DomainError::Database)
        }
    }

    fn get_tags_for_tasks_batch(
        conn: &Connection,
        task_ids: &[&str],
    ) -> Result<HashMap<String, Vec<Tag>>, DomainError> {
        if task_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let placeholders: Vec<String> = (1..=task_ids.len()).map(|index| format!("?{index}")).collect();
        let sql = format!(
            "SELECT tt.task_id, t.id, t.name, t.color, t.created_at \
             FROM tags t \
             INNER JOIN task_tags tt ON tt.tag_id = t.id \
             WHERE tt.task_id IN ({})",
            placeholders.join(", ")
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            task_ids.iter().map(|task_id| task_id as &dyn rusqlite::ToSql).collect();
        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
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

    fn get_subtasks(conn: &Connection, parent_id: &str) -> Result<Vec<TaskData>, DomainError> {
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

fn row_to_task_progress_data(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskProgressData> {
    Ok(TaskProgressData {
        id: row.get(0)?,
        task_id: row.get(1)?,
        content: row.get(2)?,
        content_format: row.get(3)?,
        created_at: row.get(4)?,
    })
}
