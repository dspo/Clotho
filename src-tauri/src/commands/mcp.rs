use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::error::AppError;
use crate::state::{AppState, McpHandle};

const DEFAULT_MCP_URL: &str = "http://0.0.0.0:7400/mcp";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub enabled: bool,
    pub url: String,
    pub bind_addr: String,
    pub has_server_task: bool,
    pub running: bool,
    pub state: String,
    pub message: Option<String>,
}

pub fn spawn_mcp_server(app_state: Arc<AppState>, bind_addr: String) -> CancellationToken {
    let token = CancellationToken::new();
    let token_clone = token.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::mcp::start_server(app_state, &bind_addr, token_clone).await {
            eprintln!("[MCP] server error: {e}");
        }
    });
    token
}

fn bind_addr_from_url(url: &str) -> String {
    let bind_addr = url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches("/mcp")
        .trim_end_matches('/')
        .to_string();
    if bind_addr.is_empty() {
        "0.0.0.0:7400".to_string()
    } else {
        bind_addr
    }
}

fn load_mcp_runtime_settings(db: &rusqlite::Connection) -> (bool, String, String) {
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
        .unwrap_or_else(|_| DEFAULT_MCP_URL.to_string());

    let bind_addr = bind_addr_from_url(&url);
    (enabled, url, bind_addr)
}

fn probe_running(bind_addr: &str) -> bool {
    let probe_target = if let Some(rest) = bind_addr.strip_prefix("0.0.0.0:") {
        format!("127.0.0.1:{rest}")
    } else {
        bind_addr.to_string()
    };
    let Ok(mut addrs) = std::net::ToSocketAddrs::to_socket_addrs(&probe_target) else {
        return false;
    };
    let Some(addr) = addrs.next() else {
        return false;
    };
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn current_status(mcp_handle: &McpHandle, message: Option<String>) -> Result<McpServerStatus, AppError> {
    let db = mcp_handle.app_state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    let (enabled, url, bind_addr) = load_mcp_runtime_settings(&db);
    drop(db);

    let has_server_task = mcp_handle.token.lock()
        .map(|g| g.is_some())
        .unwrap_or(false);
    let running = enabled && has_server_task && probe_running(&bind_addr);
    let state = if !enabled {
        "disabled"
    } else if running {
        "running"
    } else if has_server_task {
        "starting"
    } else {
        "stopped"
    };

    Ok(McpServerStatus {
        enabled,
        url,
        bind_addr,
        has_server_task,
        running,
        state: state.to_string(),
        message,
    })
}

#[tauri::command]
pub fn get_mcp_server_status(mcp_handle: State<'_, McpHandle>) -> Result<McpServerStatus, AppError> {
    current_status(&mcp_handle, None)
}

#[tauri::command]
pub fn restart_mcp_server(mcp_handle: State<'_, McpHandle>) -> Result<McpServerStatus, AppError> {
    let db = mcp_handle.app_state.db.lock().map_err(|_| {
        AppError::Database(rusqlite::Error::ExecuteReturnedResults)
    })?;
    let (enabled, _, bind_addr) = load_mcp_runtime_settings(&db);
    drop(db);

    // Update bind_addr
    if let Ok(mut guard) = mcp_handle.bind_addr.lock() {
        *guard = bind_addr.clone();
    }

    // Restart server
    if let Ok(mut guard) = mcp_handle.token.lock() {
        if let Some(old) = guard.take() {
            old.cancel();
        }
        if enabled {
            let token = spawn_mcp_server(Arc::clone(&mcp_handle.app_state), bind_addr);
            *guard = Some(token);
        }
    }

    std::thread::sleep(Duration::from_millis(200));
    let message = if enabled {
        Some("MCP restart requested".to_string())
    } else {
        Some("MCP disabled; server is stopped".to_string())
    };
    current_status(&mcp_handle, message)
}
