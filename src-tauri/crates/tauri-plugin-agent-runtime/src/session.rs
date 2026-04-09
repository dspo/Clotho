use std::collections::HashMap;
use std::sync::Arc;

use agent_core::AgentRuntime;
use chrono::Utc;
use codex_app_server_protocol::RequestId;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::config::{DefaultConfigProvider, SharedConfigProvider};
use crate::error::{Error, Result};
use crate::models::{
    AssistantTurnStreamEnvelope, ConfigSelection, ConversationBlock, CreateThreadResponse,
    ListConfigsResponse, ListThreadsRequest, ListThreadsResponse, PendingRuntimeRequest,
    ResolvedConfig, ThreadSnapshot, ThreadSummary, TurnSummarySnapshot,
};
use crate::runtime::EmbeddedCodexRuntime;

const DEFAULT_THREAD_TITLE: &str = "New thread";
const MAX_STORED_THREADS: usize = 100;
const MAX_RUNNING_TURN_HISTORY_ITEMS: usize = 512;
const MAX_COMPLETED_TURN_HISTORY_ITEMS: usize = 64;

#[derive(Clone)]
pub struct AssistantRuntimeState {
    inner: Arc<Mutex<AssistantRuntimeInner>>,
    runtime: EmbeddedCodexRuntime,
    config_provider: SharedConfigProvider,
    agent_runtime: Option<Arc<AgentRuntime>>,
}

impl Default for AssistantRuntimeState {
    fn default() -> Self {
        Self::new(Arc::new(DefaultConfigProvider::default()), None)
    }
}

#[derive(Default)]
struct AssistantRuntimeInner {
    threads: HashMap<String, ThreadRecord>,
    runtime_thread_index: HashMap<String, String>,
    runtime_turn_index: HashMap<(String, String), (String, String)>,
    pending_request_index: HashMap<String, (String, String)>,
}

struct ThreadRecord {
    thread_id: String,
    runtime_thread_id: Option<String>,
    title: String,
    updated_at: String,
    config_context: Option<ConfigSelection>,
    blocks: Vec<ConversationBlock>,
    turns: HashMap<String, TurnRecord>,
    active_turn_id: Option<String>,
}

struct TurnRecord {
    turn_id: String,
    runtime_turn_id: Option<String>,
    stream_id: String,
    accepted_at: String,
    status: String,
    last_seq: u64,
    history: Vec<AssistantTurnStreamEnvelope>,
    subscribers: Vec<Channel<AssistantTurnStreamEnvelope>>,
    pending_requests: HashMap<String, PendingRuntimeRequestRecord>,
}

struct PendingRuntimeRequestRecord {
    request_id: RequestId,
    request: PendingRuntimeRequest,
}

pub struct StartedTurn {
    pub thread_id: String,
    pub turn_id: String,
    pub stream_id: String,
    pub accepted_at: String,
}

pub struct ResumeDispatch {
    pub items: Vec<AssistantTurnStreamEnvelope>,
    pub running: bool,
}

pub struct RuntimeTurnBinding {
    pub runtime_thread_id: String,
    pub runtime_turn_id: String,
}

pub struct StreamDispatch {
    pub item: AssistantTurnStreamEnvelope,
    pub subscribers: Vec<Channel<AssistantTurnStreamEnvelope>>,
}

pub struct PendingRuntimeRequestHandle {
    pub request_id: RequestId,
    pub request_kind: String,
}

impl AssistantRuntimeState {
    pub fn new(
        config_provider: SharedConfigProvider,
        agent_runtime: Option<Arc<AgentRuntime>>,
    ) -> Self {
        Self {
            inner: Arc::new(Mutex::new(AssistantRuntimeInner::default())),
            runtime: EmbeddedCodexRuntime::default(),
            config_provider,
            agent_runtime,
        }
    }

    pub fn runtime(&self) -> &EmbeddedCodexRuntime {
        &self.runtime
    }

    pub fn config_provider(&self) -> SharedConfigProvider {
        self.config_provider.clone()
    }

    pub fn agent_runtime(&self) -> Option<Arc<AgentRuntime>> {
        self.agent_runtime.clone()
    }

    pub fn list_configs(&self) -> Result<ListConfigsResponse> {
        self.config_provider.list_configs()
    }

    pub fn resolve_config_selection(
        &self,
        selection: Option<ConfigSelection>,
    ) -> Result<ResolvedConfig> {
        self.config_provider.resolve_config(selection.as_ref())
    }

    pub fn request_overrides(
        &self,
        selection: Option<&ConfigSelection>,
    ) -> Result<HashMap<String, Value>> {
        self.config_provider.request_overrides(selection)
    }

    pub async fn list_threads(&self, req: ListThreadsRequest) -> ListThreadsResponse {
        let inner = self.inner.lock().await;
        let mut threads = inner
            .threads
            .values()
            .map(thread_summary)
            .collect::<Vec<_>>();
        threads.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

        let start = req
            .cursor
            .as_ref()
            .and_then(|cursor| {
                threads
                    .iter()
                    .position(|thread| &thread.thread_id == cursor)
            })
            .map(|index| index + 1)
            .unwrap_or(0);
        let limit = req.limit.unwrap_or(50);
        let items = threads
            .into_iter()
            .skip(start)
            .take(limit)
            .collect::<Vec<_>>();
        let next_cursor = inner
            .threads
            .contains_key(
                items
                    .last()
                    .map(|item| item.thread_id.as_str())
                    .unwrap_or_default(),
            )
            .then(|| items.last().map(|item| item.thread_id.clone()))
            .flatten()
            .filter(|_| inner.threads.len() > start + items.len());

        ListThreadsResponse { items, next_cursor }
    }

    pub async fn get_thread_snapshot(&self, thread_id: &str) -> Result<ThreadSnapshot> {
        let (thread_id, title, blocks, active_turn, config_selection, mut pending_requests) = {
            let inner = self.inner.lock().await;
            let thread = inner
                .threads
                .get(thread_id)
                .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;

            let active_turn = thread
                .active_turn_id
                .as_ref()
                .and_then(|turn_id| thread.turns.get(turn_id))
                .filter(|turn| turn.status == "running")
                .map(|turn| TurnSummarySnapshot {
                    turn_id: turn.turn_id.clone(),
                    status: turn.status.clone(),
                    accepted_at: turn.accepted_at.clone(),
                    last_seq: turn.last_seq,
                });

            let pending_requests = thread
                .turns
                .values()
                .flat_map(|turn| {
                    turn.pending_requests
                        .values()
                        .map(|record| record.request.clone())
                })
                .collect::<Vec<_>>();

            (
                thread.thread_id.clone(),
                thread.title.clone(),
                thread.blocks.clone(),
                active_turn,
                thread.config_context.clone(),
                pending_requests,
            )
        };

        let config_context = config_selection
            .map(|selection| self.resolve_config_selection(Some(selection)))
            .transpose()?;

        pending_requests.sort_by(|left, right| left.created_at.cmp(&right.created_at));

        Ok(ThreadSnapshot {
            thread_id,
            title,
            blocks,
            active_turn,
            config_context,
            pending_requests,
        })
    }

    pub async fn create_thread(
        &self,
        title: Option<String>,
        config_context: Option<ConfigSelection>,
    ) -> CreateThreadResponse {
        let mut inner = self.inner.lock().await;
        let thread_id = Uuid::new_v4().to_string();
        let resolved_title = title
            .map(|title| title.trim().to_string())
            .filter(|title| !title.is_empty())
            .unwrap_or_else(|| DEFAULT_THREAD_TITLE.to_string());
        let updated_at = now_rfc3339();

        inner.threads.insert(
            thread_id.clone(),
            ThreadRecord {
                thread_id: thread_id.clone(),
                runtime_thread_id: None,
                title: resolved_title.clone(),
                updated_at,
                config_context,
                blocks: Vec::new(),
                turns: HashMap::new(),
                active_turn_id: None,
            },
        );
        prune_inactive_threads(&mut inner);

        CreateThreadResponse {
            thread_id,
            title: resolved_title,
        }
    }

    pub async fn start_turn(
        &self,
        thread_id: &str,
        text: &str,
        config_context: Option<ConfigSelection>,
        on_event: Channel<AssistantTurnStreamEnvelope>,
    ) -> Result<StartedTurn> {
        self.start_turn_internal(thread_id, text, config_context, Some(on_event))
            .await
    }

    pub async fn start_background_turn(
        &self,
        thread_id: &str,
        text: &str,
        config_context: Option<ConfigSelection>,
    ) -> Result<StartedTurn> {
        self.start_turn_internal(thread_id, text, config_context, None)
            .await
    }

    async fn start_turn_internal(
        &self,
        thread_id: &str,
        text: &str,
        config_context: Option<ConfigSelection>,
        on_event: Option<Channel<AssistantTurnStreamEnvelope>>,
    ) -> Result<StartedTurn> {
        let trimmed_text = text.trim();
        if trimmed_text.is_empty() {
            return Err(Error::InvalidInput(
                "turn text must not be empty".to_string(),
            ));
        }

        let mut inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;

        if let Some(active_turn_id) = thread.active_turn_id.as_ref() {
            let has_running_turn = thread
                .turns
                .get(active_turn_id)
                .is_some_and(|turn| turn.status == "running");
            if has_running_turn {
                return Err(Error::Conflict(format!(
                    "thread `{thread_id}` already has a running turn"
                )));
            }
        }

        if let Some(config_context) = config_context {
            if thread.runtime_thread_id.is_some()
                && thread.config_context.as_ref() != Some(&config_context)
            {
                return Err(Error::Conflict(format!(
                    "thread `{thread_id}` is already bound to a different config context"
                )));
            }
            thread.config_context = Some(config_context);
        }

        if should_derive_title(thread) {
            thread.title = derive_title(trimmed_text);
        }

        thread.blocks.push(ConversationBlock {
            block_id: Uuid::new_v4().to_string(),
            kind: "user_message".to_string(),
            title: None,
            text: trimmed_text.to_string(),
            status: Some("completed".to_string()),
            metadata: Some(json!({ "threadId": thread_id })),
        });

        let turn_id = Uuid::new_v4().to_string();
        let stream_id = Uuid::new_v4().to_string();
        let accepted_at = now_rfc3339();

        thread.updated_at = accepted_at.clone();
        thread.active_turn_id = Some(turn_id.clone());
        thread.turns.insert(
            turn_id.clone(),
            TurnRecord {
                turn_id: turn_id.clone(),
                runtime_turn_id: None,
                stream_id: stream_id.clone(),
                accepted_at: accepted_at.clone(),
                status: "running".to_string(),
                last_seq: 0,
                history: Vec::new(),
                subscribers: on_event.into_iter().collect(),
                pending_requests: HashMap::new(),
            },
        );

        Ok(StartedTurn {
            thread_id: thread_id.to_string(),
            turn_id,
            stream_id,
            accepted_at,
        })
    }

    pub async fn resume_turn_stream(
        &self,
        thread_id: &str,
        turn_id: &str,
        after_seq: Option<u64>,
        on_event: Channel<AssistantTurnStreamEnvelope>,
    ) -> Result<ResumeDispatch> {
        let mut inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get_mut(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;

        let after_seq = after_seq.unwrap_or(0);
        let items = turn
            .history
            .iter()
            .filter(|item| item.seq > after_seq)
            .cloned()
            .collect::<Vec<_>>();
        let running = turn.status == "running";
        if running {
            turn.subscribers.push(on_event);
        }

        Ok(ResumeDispatch { items, running })
    }

    pub async fn thread_config_selection(
        &self,
        thread_id: &str,
    ) -> Result<Option<ConfigSelection>> {
        let inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        Ok(thread.config_context.clone())
    }

    pub async fn pending_request_handle(
        &self,
        thread_id: &str,
        turn_id: &str,
        request_id: &str,
    ) -> Result<PendingRuntimeRequestHandle> {
        let inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;
        let request = turn
            .pending_requests
            .get(request_id)
            .ok_or_else(|| Error::NotFound(format!("runtime request `{request_id}`")))?;
        Ok(PendingRuntimeRequestHandle {
            request_id: request.request_id.clone(),
            request_kind: request.request.request_kind.clone(),
        })
    }

    pub async fn thread_title(&self, thread_id: &str) -> Option<String> {
        let inner = self.inner.lock().await;
        inner
            .threads
            .get(thread_id)
            .map(|thread| thread.title.clone())
    }

    pub async fn latest_assistant_message_for_turn(
        &self,
        thread_id: &str,
        turn_id: &str,
    ) -> Result<Option<(String, String)>> {
        let inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let message = thread
            .blocks
            .iter()
            .rev()
            .find(|block| {
                block.kind == "assistant_message"
                    && block
                        .metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("turnId"))
                        .and_then(Value::as_str)
                        .is_some_and(|value| value == turn_id)
            })
            .map(|block| (block.block_id.clone(), block.text.clone()));
        Ok(message)
    }

    pub async fn turn_status(&self, thread_id: &str, turn_id: &str) -> Result<String> {
        let inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;
        Ok(turn.status.clone())
    }

    pub async fn pending_requests_for_turn(
        &self,
        thread_id: &str,
        turn_id: &str,
    ) -> Result<Vec<PendingRuntimeRequest>> {
        let inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;
        let mut items = turn
            .pending_requests
            .values()
            .map(|record| record.request.clone())
            .collect::<Vec<_>>();
        items.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        Ok(items)
    }

    pub async fn runtime_thread_id(&self, thread_id: &str) -> Result<Option<String>> {
        let inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        Ok(thread.runtime_thread_id.clone())
    }

    pub async fn bind_runtime_thread(
        &self,
        thread_id: &str,
        runtime_thread_id: &str,
    ) -> Result<()> {
        let mut inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;

        if let Some(existing) = thread.runtime_thread_id.as_deref() {
            if existing != runtime_thread_id {
                return Err(Error::Conflict(format!(
                    "thread `{thread_id}` is already bound to runtime thread `{existing}`"
                )));
            }
            return Ok(());
        }

        thread.runtime_thread_id = Some(runtime_thread_id.to_string());
        inner
            .runtime_thread_index
            .insert(runtime_thread_id.to_string(), thread_id.to_string());
        Ok(())
    }

    pub async fn bind_runtime_turn(
        &self,
        thread_id: &str,
        turn_id: &str,
        runtime_turn_id: &str,
    ) -> Result<()> {
        let mut inner = self.inner.lock().await;
        let runtime_thread_id = {
            let thread = inner
                .threads
                .get(thread_id)
                .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
            thread
                .runtime_thread_id
                .clone()
                .ok_or_else(|| Error::Conflict(format!("thread `{thread_id}` is not bound")))?
        };

        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get_mut(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;

        if let Some(existing) = turn.runtime_turn_id.as_deref() {
            if existing != runtime_turn_id {
                return Err(Error::Conflict(format!(
                    "turn `{turn_id}` is already bound to runtime turn `{existing}`"
                )));
            }
            return Ok(());
        }

        turn.runtime_turn_id = Some(runtime_turn_id.to_string());
        inner.runtime_turn_index.insert(
            (runtime_thread_id, runtime_turn_id.to_string()),
            (thread_id.to_string(), turn_id.to_string()),
        );
        Ok(())
    }

    pub async fn resolve_local_turn_for_runtime(
        &self,
        runtime_thread_id: &str,
        runtime_turn_id: &str,
    ) -> Option<(String, String)> {
        let mut inner = self.inner.lock().await;
        if let Some(binding) = inner
            .runtime_turn_index
            .get(&(runtime_thread_id.to_string(), runtime_turn_id.to_string()))
            .cloned()
        {
            return Some(binding);
        }

        let local_thread_id = inner.runtime_thread_index.get(runtime_thread_id)?.clone();
        let thread = inner.threads.get_mut(&local_thread_id)?;
        // Runtime notifications can arrive before the explicit runtime-turn binding is recorded.
        // In that narrow window, the active running turn on the already-bound local thread is the
        // only safe fallback candidate. If the turn has already completed or has been bound by a
        // different runtime turn, we refuse to guess and return None.
        let local_turn_id = thread.active_turn_id.clone()?;
        let turn = thread.turns.get_mut(&local_turn_id)?;
        if turn.status != "running" || turn.runtime_turn_id.is_some() {
            return None;
        }

        turn.runtime_turn_id = Some(runtime_turn_id.to_string());
        inner.runtime_turn_index.insert(
            (runtime_thread_id.to_string(), runtime_turn_id.to_string()),
            (local_thread_id.clone(), local_turn_id.clone()),
        );
        Some((local_thread_id, local_turn_id))
    }

    pub async fn resolve_local_turn_for_runtime_thread(
        &self,
        runtime_thread_id: &str,
    ) -> Option<(String, String)> {
        let inner = self.inner.lock().await;
        let local_thread_id = inner.runtime_thread_index.get(runtime_thread_id)?.clone();
        let thread = inner.threads.get(&local_thread_id)?;
        let local_turn_id = thread.active_turn_id.clone()?;
        let turn = thread.turns.get(&local_turn_id)?;
        (turn.status == "running").then_some((local_thread_id, local_turn_id))
    }

    pub async fn runtime_turn_binding(
        &self,
        thread_id: &str,
        turn_id: &str,
    ) -> Result<Option<RuntimeTurnBinding>> {
        let inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;

        match (
            thread.runtime_thread_id.as_ref(),
            turn.runtime_turn_id.as_ref(),
        ) {
            (Some(runtime_thread_id), Some(runtime_turn_id)) => Ok(Some(RuntimeTurnBinding {
                runtime_thread_id: runtime_thread_id.clone(),
                runtime_turn_id: runtime_turn_id.clone(),
            })),
            _ => Ok(None),
        }
    }

    pub async fn store_pending_runtime_request(
        &self,
        thread_id: &str,
        turn_id: &str,
        request_id: String,
        request_handle: RequestId,
        request_kind: String,
        item_id: Option<String>,
        approval_id: Option<String>,
        title: Option<String>,
        summary: Option<String>,
        payload: Value,
    ) -> Result<PendingRuntimeRequest> {
        let mut inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get_mut(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;

        if turn.pending_requests.contains_key(&request_id) {
            return Err(Error::Conflict(format!(
                "runtime request `{request_id}` already exists"
            )));
        }

        let request = PendingRuntimeRequest {
            request_id: request_id.clone(),
            request_kind,
            item_id,
            approval_id,
            title,
            summary,
            payload,
            created_at: now_rfc3339(),
        };

        turn.pending_requests.insert(
            request_id.clone(),
            PendingRuntimeRequestRecord {
                request_id: request_handle,
                request: request.clone(),
            },
        );
        inner
            .pending_request_index
            .insert(request_id, (thread_id.to_string(), turn_id.to_string()));

        Ok(request)
    }

    pub async fn remove_pending_runtime_request(
        &self,
        thread_id: &str,
        turn_id: &str,
        request_id: &str,
    ) -> Result<Option<PendingRuntimeRequest>> {
        let mut inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get_mut(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;

        let removed = turn
            .pending_requests
            .remove(request_id)
            .map(|record| record.request);
        inner.pending_request_index.remove(request_id);
        Ok(removed)
    }

    pub async fn clear_pending_requests_for_turn(
        &self,
        thread_id: &str,
        turn_id: &str,
    ) -> Result<()> {
        let mut inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get_mut(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;
        let request_ids = turn.pending_requests.keys().cloned().collect::<Vec<_>>();
        turn.pending_requests.clear();
        for request_id in request_ids {
            inner.pending_request_index.remove(&request_id);
        }
        Ok(())
    }

    pub async fn push_stream_event<T: Serialize>(
        &self,
        thread_id: &str,
        turn_id: &str,
        source: &str,
        kind: &str,
        payload: T,
    ) -> Result<StreamDispatch> {
        let payload = serde_json::to_value(payload)?;
        let mut inner = self.inner.lock().await;
        let thread = inner
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| Error::NotFound(format!("thread `{thread_id}`")))?;
        let turn = thread
            .turns
            .get_mut(turn_id)
            .ok_or_else(|| Error::NotFound(format!("turn `{turn_id}`")))?;

        let next_seq = turn.last_seq + 1;
        let item = AssistantTurnStreamEnvelope {
            stream_id: turn.stream_id.clone(),
            item_id: Uuid::new_v4().to_string(),
            seq: next_seq,
            emitted_at: now_rfc3339(),
            thread_id: thread_id.to_string(),
            turn_id: turn_id.to_string(),
            source: source.to_string(),
            kind: kind.to_string(),
            payload,
        };

        turn.last_seq = next_seq;
        turn.history.push(item.clone());
        trim_turn_history(turn, MAX_RUNNING_TURN_HISTORY_ITEMS);
        let subscribers = turn.subscribers.clone();
        apply_stream_item(thread, turn_id, &item);
        thread.updated_at = item.emitted_at.clone();

        Ok(StreamDispatch { item, subscribers })
    }
}

fn should_derive_title(thread: &ThreadRecord) -> bool {
    thread.blocks.is_empty() && thread.title == DEFAULT_THREAD_TITLE
}

fn derive_title(text: &str) -> String {
    let line = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(text)
        .trim();
    let max_chars = 24;
    let title = line.chars().take(max_chars).collect::<String>();
    if line.chars().count() > max_chars {
        format!("{title}...")
    } else {
        title
    }
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

fn truncate_preview(text: &str) -> String {
    let preview = text.trim();
    if preview.is_empty() {
        return String::new();
    }

    let max_chars = 48;
    let truncated = preview.chars().take(max_chars).collect::<String>();
    if preview.chars().count() > max_chars {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn thread_summary(thread: &ThreadRecord) -> ThreadSummary {
    let last_message_preview = thread
        .blocks
        .iter()
        .rev()
        .find_map(|block| (!block.text.trim().is_empty()).then(|| truncate_preview(&block.text)))
        .filter(|preview| !preview.is_empty())
        .unwrap_or_else(|| thread.title.clone());

    let has_running_turn = thread
        .active_turn_id
        .as_ref()
        .and_then(|turn_id| thread.turns.get(turn_id))
        .is_some_and(|turn| turn.status == "running");

    ThreadSummary {
        thread_id: thread.thread_id.clone(),
        title: thread.title.clone(),
        last_message_preview,
        updated_at: thread.updated_at.clone(),
        has_running_turn,
    }
}

fn apply_stream_item(thread: &mut ThreadRecord, turn_id: &str, item: &AssistantTurnStreamEnvelope) {
    match item.kind.as_str() {
        "reasoning_started" => {
            let block_id = payload_string(&item.payload, "blockId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let block = upsert_block(
                &mut thread.blocks,
                &block_id,
                "reasoning",
                Some("Reasoning".to_string()),
                turn_id,
            );
            block.status = Some("streaming".to_string());
        }
        "reasoning_delta" => {
            let block_id = payload_string(&item.payload, "blockId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let text_delta = payload_string(&item.payload, "textDelta").unwrap_or_default();
            let block = upsert_block(
                &mut thread.blocks,
                &block_id,
                "reasoning",
                Some("Reasoning".to_string()),
                turn_id,
            );
            block.text.push_str(&text_delta);
            block.status = Some("streaming".to_string());
        }
        "reasoning_completed" => {
            let block_id = payload_string(&item.payload, "blockId");
            if let Some(block_id) = block_id.as_deref() {
                if let Some(block) = find_block_mut(&mut thread.blocks, block_id) {
                    block.status = Some("completed".to_string());
                }
            }
        }
        "assistant_message_delta" => {
            let message_id = payload_string(&item.payload, "messageId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let text_delta = payload_string(&item.payload, "textDelta").unwrap_or_default();
            let block = upsert_block(
                &mut thread.blocks,
                &message_id,
                "assistant_message",
                None,
                turn_id,
            );
            block.text.push_str(&text_delta);
            block.status = Some("streaming".to_string());
        }
        "tool_call_started" => {
            let tool_call_id = payload_string(&item.payload, "toolCallId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let tool_name =
                payload_string(&item.payload, "toolName").unwrap_or_else(|| "tool".to_string());
            let summary = payload_string(&item.payload, "summary").unwrap_or_default();
            let block = upsert_block(
                &mut thread.blocks,
                &tool_call_id,
                "tool_call",
                Some(tool_name),
                turn_id,
            );
            if !summary.is_empty() {
                block.text = summary;
            }
            block.status = Some("running".to_string());
            block.metadata = Some(metadata_with_turn(turn_id, item.payload.clone()));
        }
        "tool_call_finished" => {
            let tool_call_id = payload_string(&item.payload, "toolCallId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let tool_name =
                payload_string(&item.payload, "toolName").unwrap_or_else(|| "tool".to_string());
            let summary = payload_string(&item.payload, "summary").unwrap_or_default();
            let status =
                payload_string(&item.payload, "status").unwrap_or_else(|| "completed".to_string());
            let block = upsert_block(
                &mut thread.blocks,
                &tool_call_id,
                "tool_call",
                Some(tool_name),
                turn_id,
            );
            if !summary.is_empty() {
                block.text = summary;
            }
            block.status = Some(status);
            block.metadata = Some(metadata_with_turn(turn_id, item.payload.clone()));
        }
        "runtime_request_pending" => {
            let request_id = payload_string(&item.payload, "requestId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let title = payload_string(&item.payload, "title")
                .or_else(|| payload_string(&item.payload, "requestKind"))
                .unwrap_or_else(|| "runtime_request".to_string());
            let summary = payload_string(&item.payload, "summary").unwrap_or_default();
            let block = upsert_block(
                &mut thread.blocks,
                &request_id,
                "runtime_request",
                Some(title),
                turn_id,
            );
            block.text = summary;
            block.status = Some("pending".to_string());
            block.metadata = Some(metadata_with_turn(turn_id, item.payload.clone()));
        }
        "runtime_request_resolved" => {
            let request_id = payload_string(&item.payload, "requestId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let request_kind = payload_string(&item.payload, "requestKind")
                .unwrap_or_else(|| "runtime_request".to_string());
            let block = upsert_block(
                &mut thread.blocks,
                &request_id,
                "runtime_request",
                Some(request_kind),
                turn_id,
            );
            block.status = Some("completed".to_string());
            merge_runtime_request_resolution(block, item);
        }
        "proposal_ready" => {
            let proposal_id = payload_string(&item.payload, "proposalId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let summary =
                payload_string(&item.payload, "summary").unwrap_or_else(|| "Proposal".to_string());
            let block = upsert_block(
                &mut thread.blocks,
                &proposal_id,
                "proposal",
                Some("Proposal".to_string()),
                turn_id,
            );
            block.text = summary;
            block.status = Some("preview".to_string());
            block.metadata = Some(metadata_with_turn(turn_id, item.payload.clone()));

            if payload_bool(&item.payload, "consumeSourceMessage").unwrap_or(false) {
                if let Some(source_message_id) = payload_string(&item.payload, "sourceMessageId") {
                    hide_block(&mut thread.blocks, &source_message_id);
                }
            }
        }
        "proposal_apply_started" => {
            if let Some(proposal_id) = payload_string(&item.payload, "proposalId") {
                if let Some(block) = find_block_mut(&mut thread.blocks, &proposal_id) {
                    block.status = Some("applying".to_string());
                    block.metadata = Some(metadata_with_turn(turn_id, item.payload.clone()));
                }
            }
        }
        "proposal_apply_finished" => {
            let proposal_id = payload_string(&item.payload, "proposalId")
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let status =
                payload_string(&item.payload, "status").unwrap_or_else(|| "failed".to_string());
            let summary = payload_string(&item.payload, "summary").unwrap_or_default();
            let block = upsert_block(
                &mut thread.blocks,
                &proposal_id,
                "proposal",
                Some("Proposal".to_string()),
                turn_id,
            );
            if !summary.is_empty() {
                block.text = summary;
            }
            block.status = Some(status);
            block.metadata = Some(metadata_with_turn(turn_id, item.payload.clone()));
        }
        "turn_completed" => {
            complete_streaming_blocks_for_turn(&mut thread.blocks, turn_id);
            if let Some(turn) = thread.turns.get_mut(turn_id) {
                turn.status = "completed".to_string();
                turn.subscribers.clear();
                trim_turn_history(turn, MAX_COMPLETED_TURN_HISTORY_ITEMS);
            }
            if thread.active_turn_id.as_deref() == Some(turn_id) {
                thread.active_turn_id = None;
            }
        }
        "turn_failed" => {
            let code = payload_string(&item.payload, "code")
                .unwrap_or_else(|| "runtime_error".to_string());
            let message = payload_string(&item.payload, "message")
                .unwrap_or_else(|| "assistant turn failed".to_string());
            thread.blocks.push(ConversationBlock {
                block_id: Uuid::new_v4().to_string(),
                kind: "error".to_string(),
                title: Some(code),
                text: message,
                status: Some("completed".to_string()),
                metadata: Some(json!({ "turnId": turn_id })),
            });
            complete_streaming_blocks_for_turn(&mut thread.blocks, turn_id);
            if let Some(turn) = thread.turns.get_mut(turn_id) {
                turn.status = "failed".to_string();
                turn.subscribers.clear();
                trim_turn_history(turn, MAX_COMPLETED_TURN_HISTORY_ITEMS);
            }
            if thread.active_turn_id.as_deref() == Some(turn_id) {
                thread.active_turn_id = None;
            }
        }
        "turn_cancelled" => {
            thread.blocks.push(ConversationBlock {
                block_id: Uuid::new_v4().to_string(),
                kind: "system_notice".to_string(),
                title: Some("Cancelled".to_string()),
                text: "The current turn was cancelled.".to_string(),
                status: Some("completed".to_string()),
                metadata: Some(json!({ "turnId": turn_id })),
            });
            complete_streaming_blocks_for_turn(&mut thread.blocks, turn_id);
            if let Some(turn) = thread.turns.get_mut(turn_id) {
                turn.status = "cancelled".to_string();
                turn.subscribers.clear();
                trim_turn_history(turn, MAX_COMPLETED_TURN_HISTORY_ITEMS);
            }
            if thread.active_turn_id.as_deref() == Some(turn_id) {
                thread.active_turn_id = None;
            }
        }
        _ => {}
    }
}

fn payload_string(payload: &Value, key: &str) -> Option<String> {
    payload.get(key).and_then(Value::as_str).map(str::to_string)
}

fn payload_bool(payload: &Value, key: &str) -> Option<bool> {
    payload.get(key).and_then(Value::as_bool)
}

fn trim_turn_history(turn: &mut TurnRecord, limit: usize) {
    let overflow = turn.history.len().saturating_sub(limit);
    if overflow > 0 {
        turn.history.drain(0..overflow);
    }
}

fn prune_inactive_threads(inner: &mut AssistantRuntimeInner) {
    let overflow = inner.threads.len().saturating_sub(MAX_STORED_THREADS);
    if overflow == 0 {
        return;
    }

    let mut inactive_threads = inner
        .threads
        .values()
        .filter(|thread| thread.active_turn_id.is_none())
        .map(|thread| (thread.updated_at.clone(), thread.thread_id.clone()))
        .collect::<Vec<_>>();
    inactive_threads.sort_by(|left, right| left.0.cmp(&right.0));

    for (_, thread_id) in inactive_threads.into_iter().take(overflow) {
        remove_thread(inner, &thread_id);
    }
}

fn remove_thread(inner: &mut AssistantRuntimeInner, thread_id: &str) {
    let Some(thread) = inner.threads.remove(thread_id) else {
        return;
    };

    if let Some(runtime_thread_id) = thread.runtime_thread_id.as_ref() {
        inner.runtime_thread_index.remove(runtime_thread_id);
        for turn in thread.turns.values() {
            if let Some(runtime_turn_id) = turn.runtime_turn_id.as_ref() {
                inner
                    .runtime_turn_index
                    .remove(&(runtime_thread_id.clone(), runtime_turn_id.clone()));
            }
        }
    }

    for request_id in thread
        .turns
        .values()
        .flat_map(|turn| turn.pending_requests.keys())
    {
        inner.pending_request_index.remove(request_id);
    }
}

fn complete_streaming_blocks_for_turn(blocks: &mut [ConversationBlock], turn_id: &str) {
    for block in blocks.iter_mut() {
        let same_turn = block
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("turnId"))
            .and_then(Value::as_str)
            .is_some_and(|value| value == turn_id);
        if same_turn {
            match block.status.as_deref() {
                Some("streaming") => block.status = Some("completed".to_string()),
                Some("pending") if block.kind == "runtime_request" => {
                    block.status = Some("expired".to_string())
                }
                _ => {}
            }
        }
    }
}

fn merge_runtime_request_resolution(
    block: &mut ConversationBlock,
    item: &AssistantTurnStreamEnvelope,
) {
    let mut metadata = block.metadata.take().unwrap_or_else(|| json!({}));
    if !metadata.is_object() {
        metadata = json!({});
    }
    if let Some(map) = metadata.as_object_mut() {
        map.insert(
            "resolvedAt".to_string(),
            Value::String(item.emitted_at.clone()),
        );
        map.insert("resolution".to_string(), item.payload.clone());
    }
    block.metadata = Some(metadata);
}

fn metadata_with_turn(turn_id: &str, payload: Value) -> Value {
    let mut metadata = payload;
    if !metadata.is_object() {
        metadata = json!({ "payload": metadata });
    }
    if let Some(map) = metadata.as_object_mut() {
        map.entry("turnId".to_string())
            .or_insert_with(|| Value::String(turn_id.to_string()));
    }
    metadata
}

fn find_block_mut<'a>(
    blocks: &'a mut [ConversationBlock],
    block_id: &str,
) -> Option<&'a mut ConversationBlock> {
    blocks.iter_mut().find(|block| block.block_id == block_id)
}

fn hide_block(blocks: &mut [ConversationBlock], block_id: &str) {
    if let Some(block) = find_block_mut(blocks, block_id) {
        let mut metadata = block.metadata.take().unwrap_or_else(|| json!({}));
        if !metadata.is_object() {
            metadata = json!({});
        }
        if let Some(map) = metadata.as_object_mut() {
            map.insert("hidden".to_string(), Value::Bool(true));
        }
        block.metadata = Some(metadata);
    }
}

fn upsert_block<'a>(
    blocks: &'a mut Vec<ConversationBlock>,
    block_id: &str,
    kind: &str,
    title: Option<String>,
    turn_id: &str,
) -> &'a mut ConversationBlock {
    if let Some(index) = blocks.iter().position(|block| block.block_id == block_id) {
        return &mut blocks[index];
    }

    blocks.push(ConversationBlock {
        block_id: block_id.to_string(),
        kind: kind.to_string(),
        title,
        text: String::new(),
        status: Some("pending".to_string()),
        metadata: Some(json!({ "turnId": turn_id })),
    });
    blocks.last_mut().expect("newly pushed block must exist")
}
