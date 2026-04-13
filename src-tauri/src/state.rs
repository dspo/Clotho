use clotho_domain::ProposalPayload;
use rusqlite::Connection;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

const MAX_PROPOSAL_CACHE_ENTRIES: usize = 128;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub proposal_cache: Mutex<ProposalCache>,
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

#[derive(Default)]
pub struct ProposalCache {
    entries: HashMap<ProposalCacheKey, ProposalPayload>,
    order: VecDeque<ProposalCacheKey>,
}

impl ProposalCache {
    pub fn get(&mut self, key: &ProposalCacheKey) -> Option<ProposalPayload> {
        let proposal = self.entries.get(key).cloned();
        if proposal.is_some() {
            self.promote(key);
        }
        proposal
    }

    pub fn insert(&mut self, key: ProposalCacheKey, proposal: ProposalPayload) {
        self.entries.insert(key.clone(), proposal);
        self.promote(&key);

        while self.entries.len() > MAX_PROPOSAL_CACHE_ENTRIES {
            let Some(evicted_key) = self.order.pop_front() else {
                break;
            };
            self.entries.remove(&evicted_key);
        }
    }

    fn promote(&mut self, key: &ProposalCacheKey) {
        if let Some(index) = self.order.iter().position(|candidate| candidate == key) {
            self.order.remove(index);
        }
        self.order.push_back(key.clone());
    }
}

impl AppState {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self {
            db,
            proposal_cache: Mutex::new(ProposalCache::default()),
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
