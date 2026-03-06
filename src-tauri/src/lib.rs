mod commands;
mod data;
mod db;
mod error;
mod mcp;
mod models;
mod repository;
mod state;

use state::{AppState, McpHandle};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use tokio_util::sync::CancellationToken;

fn load_mcp_settings(db: &rusqlite::Connection) -> (bool, String) {
    let enabled: bool = db
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'mcp_enabled'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|v| v == "true")
        .unwrap_or(false);

    let url: String = db
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'mcp_url'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "0.0.0.0:7400".to_string());

    // Strip http:// prefix and /mcp suffix to get a bind address
    let bind_addr = url
        .trim_start_matches("http://")
        .trim_end_matches("/mcp")
        .to_string();
    let bind_addr = if bind_addr.is_empty() {
        "0.0.0.0:7400".to_string()
    } else {
        bind_addr
    };

    (enabled, bind_addr)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("clotho", |ctx, request| {
            let uri = request.uri();
            let host = uri.host().unwrap_or("");
            let path = uri.path();

            // Handle clotho://image/{image_id} where host="image" and path="/{image_id}"
            if host != "image" {
                return tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap();
            }

            // path is "/{image_id}", skip leading "/"
            let image_id = path.trim_start_matches('/');

            // Query image metadata (limit lock scope to just the query)
            let app = ctx.app_handle();
            let (filename, mime_type) = {
                let state = app.state::<AppState>();
                let conn = match state.db.lock() {
                    Ok(c) => c,
                    Err(_) => {
                        return tauri::http::Response::builder()
                            .status(500)
                            .body(Vec::new())
                            .unwrap();
                    }
                };

                let result: Result<(String, String), rusqlite::Error> = conn.query_row(
                    "SELECT filename, mime_type FROM task_images WHERE id = ?1",
                    [image_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                );

                match result {
                    Ok(data) => data,
                    Err(_) => {
                        return tauri::http::Response::builder()
                            .status(404)
                            .body(Vec::new())
                            .unwrap();
                    }
                }
            }; // conn guard dropped here, before file IO

            // Build file path: images/{id}.{ext}
            let ext = filename.rsplit('.').next().unwrap_or("bin");
            let stored_filename = format!("{}.{}", image_id, ext);

            let images_dir = match app.path().app_data_dir() {
                Ok(dir) => dir.join("images"),
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(500)
                        .body(Vec::new())
                        .unwrap();
                }
            };

            let file_path = images_dir.join(&stored_filename);

            // Read file
            let bytes = match std::fs::read(&file_path) {
                Ok(b) => b,
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap();
                }
            };

            // Validate mime_type, fallback to application/octet-stream if invalid
            let content_type = if mime_type.is_empty() || mime_type.contains('\0') {
                "application/octet-stream".to_string()
            } else {
                mime_type
            };

            match tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", content_type)
                .header("Cache-Control", "max-age=31536000, immutable")
                .body(bytes)
            {
                Ok(resp) => resp,
                Err(_) => {
                    // Fallback if header construction fails (return empty body)
                    tauri::http::Response::builder()
                        .status(500)
                        .body(Vec::new())
                        .unwrap()
                }
            }
        })
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let conn =
                db::init::initialize_db(app_data_dir).expect("failed to initialize database");

            let (mcp_enabled, mcp_bind_addr) = load_mcp_settings(&conn);

            // AppState for existing Tauri commands (plain, no Arc)
            let app_state_for_commands = AppState {
                db: Mutex::new(conn),
            };
            app.manage(app_state_for_commands);

            // Separate Arc<AppState> for MCP (opens a second SQLite connection for isolation)
            let mcp_app_state = Arc::new(AppState {
                db: Mutex::new({
                    let app_data_dir2 = app
                        .path()
                        .app_data_dir()
                        .expect("failed to resolve app data dir");
                    db::init::initialize_db(app_data_dir2)
                        .expect("failed to initialize database for mcp")
                }),
            });

            let initial_token: Option<CancellationToken> = if mcp_enabled {
                Some(commands::mcp::spawn_mcp_server(
                    Arc::clone(&mcp_app_state),
                    mcp_bind_addr.clone(),
                ))
            } else {
                None
            };

            app.manage(McpHandle {
                app_state: mcp_app_state,
                token: Mutex::new(initial_token),
                bind_addr: Mutex::new(mcp_bind_addr),
            });

            let settings_item =
                MenuItem::with_id(app, "settings", "Settings…", true, Some("cmd+,"))?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("Quit Clotho"))?;
            let app_submenu =
                Submenu::with_items(app, "Clotho", true, &[&settings_item, &separator, &quit_item])?;

            // Edit menu with standard editing items
            let undo_item = PredefinedMenuItem::undo(app, Some("Undo"))?;
            let redo_item = PredefinedMenuItem::redo(app, Some("Redo"))?;
            let cut_item = PredefinedMenuItem::cut(app, Some("Cut"))?;
            let copy_item = PredefinedMenuItem::copy(app, Some("Copy"))?;
            let paste_item = PredefinedMenuItem::paste(app, Some("Paste"))?;
            let select_all_item = PredefinedMenuItem::select_all(app, Some("Select All"))?;
            let edit_separator = PredefinedMenuItem::separator(app)?;
            let edit_submenu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &undo_item,
                    &redo_item,
                    &edit_separator,
                    &cut_item,
                    &copy_item,
                    &paste_item,
                    &select_all_item,
                ],
            )?;

            let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu])?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                if event.id().as_ref() == "settings" {
                    app.emit("open-settings", ()).ok();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // project commands
            commands::project::list_projects,
            commands::project::get_project,
            commands::project::create_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::reorder_projects,
            // task commands
            commands::task::list_tasks,
            commands::task::get_task,
            commands::task::create_task,
            commands::task::update_task,
            commands::task::delete_task,
            commands::task::reorder_tasks,
            commands::task::batch_update_tasks,
            commands::task::search_tasks,
            // tag commands
            commands::tag::list_tags,
            commands::tag::create_tag,
            commands::tag::update_tag,
            commands::tag::delete_tag,
            commands::tag::add_task_tag,
            commands::tag::remove_task_tag,
            // dependency commands
            commands::dependency::list_task_dependencies,
            commands::dependency::create_task_dependency,
            commands::dependency::delete_task_dependency,
            // settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            // image commands
            commands::image::upload_task_image,
            commands::image::list_task_images,
            commands::image::delete_task_image,
            // mcp
            commands::mcp::restart_mcp_server,
            commands::mcp::get_mcp_server_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
