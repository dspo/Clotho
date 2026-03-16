use rusqlite::Connection;

const CURRENT_VERSION: i32 = 7;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    let user_version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if user_version < 1 {
        migrate_v1(conn)?;
    }
    if user_version < 2 {
        migrate_v2(conn)?;
    }
    if user_version < 3 {
        migrate_v3(conn)?;
    }
    if user_version < 4 {
        migrate_v4(conn)?;
    }
    if user_version < 5 {
        migrate_v5(conn)?;
    }
    if user_version < 6 {
        migrate_v6(conn)?;
    }
    if user_version < 7 {
        migrate_v7(conn)?;
    }

    conn.pragma_update(None, "user_version", CURRENT_VERSION)?;
    Ok(())
}

fn migrate_v1(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT DEFAULT '#3B82F6',
            icon TEXT,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            parent_task_id TEXT REFERENCES tasks(id),
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
            priority TEXT NOT NULL DEFAULT 'low' CHECK(priority IN ('urgent', 'high', 'medium', 'low')),
            start_date TEXT,
            due_date TEXT,
            completed_at TEXT,
            is_milestone INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            kanban_order TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);

        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#6B7280',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS task_tags (
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS task_dependencies (
            id TEXT PRIMARY KEY,
            predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            successor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            dependency_type TEXT NOT NULL DEFAULT 'finish_to_start' CHECK(dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(predecessor_id, successor_id)
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )?;
    Ok(())
}

fn migrate_v2(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "ALTER TABLE tasks ADD COLUMN description_format TEXT DEFAULT NULL;",
    )?;
    Ok(())
}

fn migrate_v3(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS task_images (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_task_images_task_id ON task_images(task_id);
        ",
    )?;
    Ok(())
}

fn migrate_v4(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        ALTER TABLE tasks ADD COLUMN estimated_hours REAL;
        ALTER TABLE tasks ADD COLUMN actual_hours REAL;
        ",
    )?;
    Ok(())
}

fn migrate_v5(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "ALTER TABLE tasks ADD COLUMN difficulty TEXT CHECK(difficulty IN ('simple', 'medium', 'complex'));",
    )?;
    Ok(())
}

fn migrate_v6(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Rename 'backlog' status to 'unscheduled'
    conn.execute_batch(
        "UPDATE tasks SET status = 'unscheduled' WHERE status = 'backlog';",
    )?;
    Ok(())
}

fn migrate_v7(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS task_progress (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            content_format TEXT DEFAULT NULL CHECK(content_format IN ('richtext', 'markdown')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_task_progress_task_id ON task_progress(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_progress_created_at ON task_progress(created_at);
        ",
    )?;
    Ok(())
}
