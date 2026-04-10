use clotho_domain::ProposalPayload;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub proposal_cache: Mutex<HashMap<ProposalCacheKey, ProposalPayload>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProposalCacheKey {
    pub thread_id: String,
    pub turn_id: String,
    pub proposal_id: String,
}

impl ProposalCacheKey {
    pub fn new(thread_id: &str, turn_id: &str, proposal_id: &str) -> Self {
        Self {
            thread_id: thread_id.to_string(),
            turn_id: turn_id.to_string(),
            proposal_id: proposal_id.to_string(),
        }
    }
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        Self {
            db: Mutex::new(db),
            proposal_cache: Mutex::new(HashMap::new()),
        }
    }
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
    pub shutdown: CancellationToken,
}
