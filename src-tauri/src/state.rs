use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;
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

#[derive(Clone)]
pub struct AssistantAutomationHandle {
    pub db: Arc<Mutex<Connection>>,
    pub trigger: Arc<Notify>,
}
