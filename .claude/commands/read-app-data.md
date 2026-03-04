Read the Clotho app's SQLite database at `~/Library/Application Support/io.dspo.clotho/clotho.db`.

Display a summary of all data:

1. **Projects**: Run `sqlite3 ~/Library/Application\ Support/io.dspo.clotho/clotho.db "SELECT id, name, color, status, sort_order FROM projects ORDER BY sort_order;"`

2. **Tasks**: Run `sqlite3 -header ~/Library/Application\ Support/io.dspo.clotho/clotho.db "SELECT t.id, t.title, t.status, t.priority, t.description_format, p.name as project, t.start_date, t.due_date FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.deleted_at IS NULL ORDER BY p.name, t.sort_order;"`

3. **Tags**: Run `sqlite3 -header ~/Library/Application\ Support/io.dspo.clotho/clotho.db "SELECT t.name as tag, t.color, COUNT(tt.task_id) as task_count FROM tags t LEFT JOIN task_tags tt ON t.id = tt.tag_id GROUP BY t.id ORDER BY t.name;"`

4. **App Settings**: Run `sqlite3 -header ~/Library/Application\ Support/io.dspo.clotho/clotho.db "SELECT key, value FROM app_settings ORDER BY key;"`

5. **DB Version**: Run `sqlite3 ~/Library/Application\ Support/io.dspo.clotho/clotho.db "PRAGMA user_version;"`

Present the results in a clear, organized format grouped by project.
