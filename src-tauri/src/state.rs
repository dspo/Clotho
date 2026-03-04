use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub db: Mutex<Connection>,
}

/// Holds references needed to restart the MCP server.
pub struct McpHandle {
    pub app_state: Arc<AppState>,
    pub token: Mutex<Option<CancellationToken>>,
    pub bind_addr: Mutex<String>,
}
