use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use crate::error::Result;
use crate::models::PendingRuntimeRequest;
use crate::session::AssistantRuntimeState;

/// Policy governing how pending runtime requests are auto-resolved during
/// headless (non-interactive) turn execution.
pub enum AutoResolutionPolicy {
    /// Decline all approval requests; return empty answers for input requests.
    DeclineAll,
    /// Accept read-only operations; decline mutations.
    AcceptReadOnly,
    /// Custom resolution function per request.
    ///
    /// Return `Some(response)` to auto-resolve, or `None` to skip.
    Custom(Arc<dyn Fn(&PendingRuntimeRequest) -> Option<Value> + Send + Sync>),
}

/// Resolves a single pending request according to the given policy.
///
/// Returns `Some(response_value)` if the request should be auto-resolved, or
/// `None` if the request should be left pending (e.g. unknown request kind).
pub fn auto_resolve_request(
    policy: &AutoResolutionPolicy,
    request: &PendingRuntimeRequest,
) -> Option<Value> {
    match policy {
        AutoResolutionPolicy::DeclineAll => decline_response(request),
        AutoResolutionPolicy::AcceptReadOnly => accept_read_only_response(request),
        AutoResolutionPolicy::Custom(f) => f(request),
    }
}

/// Configuration for the headless turn runner.
pub struct HeadlessTurnRunnerConfig {
    pub timeout: Duration,
    pub poll_interval: Duration,
    pub policy: AutoResolutionPolicy,
}

impl Default for HeadlessTurnRunnerConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(600),
            poll_interval: Duration::from_secs(1),
            policy: AutoResolutionPolicy::DeclineAll,
        }
    }
}

/// Result of a headless turn execution.
pub struct HeadlessTurnResult {
    pub thread_id: String,
    pub turn_id: String,
    /// Terminal status: `"completed"`, `"failed"`, `"cancelled"`, or `"timed_out"`.
    pub status: String,
    pub latest_assistant_message: Option<String>,
}

/// Runs a turn to completion in headless mode (no UI interaction).
///
/// The runner polls turn status at `config.poll_interval`, auto-resolves any
/// pending runtime requests per `config.policy`, and interrupts the turn on
/// timeout.
///
/// Callers must have already called [`crate::start_headless_turn`] to initiate
/// the turn. This function only manages the poll-resolve-timeout lifecycle.
pub async fn run_headless_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
    config: HeadlessTurnRunnerConfig,
) -> Result<HeadlessTurnResult> {
    let deadline = Instant::now() + config.timeout;

    loop {
        auto_resolve_pending_requests(&app, &state, &thread_id, &turn_id, &config.policy).await?;

        let status = state.turn_status(&thread_id, &turn_id).await?;
        match status.as_str() {
            "running" => {
                if Instant::now() >= deadline {
                    let _ = crate::interrupt_turn(
                        app.clone(),
                        state.clone(),
                        thread_id.clone(),
                        turn_id.clone(),
                    )
                    .await;
                    return Ok(HeadlessTurnResult {
                        thread_id,
                        turn_id,
                        status: "timed_out".to_string(),
                        latest_assistant_message: None,
                    });
                }
                tokio::time::sleep(config.poll_interval).await;
            }
            terminal @ ("completed" | "failed" | "cancelled") => {
                let latest_message = state
                    .latest_assistant_message_for_turn(&thread_id, &turn_id)
                    .await?
                    .map(|(_block_id, text)| text);
                return Ok(HeadlessTurnResult {
                    thread_id,
                    turn_id,
                    status: terminal.to_string(),
                    latest_assistant_message: latest_message,
                });
            }
            _ => {
                tokio::time::sleep(config.poll_interval).await;
            }
        }
    }
}

async fn auto_resolve_pending_requests<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    thread_id: &str,
    turn_id: &str,
    policy: &AutoResolutionPolicy,
) -> Result<()> {
    let pending = state.pending_requests_for_turn(thread_id, turn_id).await?;

    for request in pending {
        let Some(response) = auto_resolve_request(policy, &request) else {
            continue;
        };
        crate::resolve_runtime_request(
            app.clone(),
            state.clone(),
            thread_id.to_string(),
            turn_id.to_string(),
            request.request_id,
            response,
        )
        .await?;
    }

    Ok(())
}

/// Builds a decline response for the given request kind.
///
/// Returns `None` for unknown request kinds.
fn decline_response(request: &PendingRuntimeRequest) -> Option<Value> {
    match request.request_kind.as_str() {
        "command_execution_request_approval" | "file_change_request_approval" => {
            Some(json!({ "decision": "decline" }))
        }
        "permissions_request_approval" => Some(json!({
            "permissions": {},
            "scope": "turn",
        })),
        "apply_patch_approval" => Some(json!({ "decision": "Denied" })),
        "exec_command_approval" => Some(json!({ "decision": "Denied" })),
        "tool_request_user_input" => Some(json!({ "answers": {} })),
        "mcp_server_elicitation_request" => Some(json!({
            "action": "decline",
            "content": Value::Null,
            "_meta": request.payload.get("_meta").cloned().unwrap_or(Value::Null),
        })),
        _ => None,
    }
}

/// Builds a response that accepts read-only operations and declines mutations.
fn accept_read_only_response(request: &PendingRuntimeRequest) -> Option<Value> {
    match request.request_kind.as_str() {
        // Read-only command executions are accepted.
        "command_execution_request_approval" => {
            if is_read_only_command(request) {
                Some(json!({ "decision": "approve" }))
            } else {
                Some(json!({ "decision": "decline" }))
            }
        }
        // File changes are always mutations.
        "file_change_request_approval" => Some(json!({ "decision": "decline" })),
        // Permissions: grant empty (non-destructive default).
        "permissions_request_approval" => Some(json!({
            "permissions": {},
            "scope": "turn",
        })),
        // Patches are mutations.
        "apply_patch_approval" => Some(json!({ "decision": "Denied" })),
        // Exec commands in AcceptReadOnly mode are declined by default
        // (no reliable way to determine read-only-ness generically).
        "exec_command_approval" => Some(json!({ "decision": "Denied" })),
        "tool_request_user_input" => Some(json!({ "answers": {} })),
        "mcp_server_elicitation_request" => Some(json!({
            "action": "decline",
            "content": Value::Null,
            "_meta": request.payload.get("_meta").cloned().unwrap_or(Value::Null),
        })),
        _ => None,
    }
}

/// Heuristic: checks if a command execution request looks read-only.
///
/// Inspects the payload for command strings that are typically non-mutating.
fn is_read_only_command(request: &PendingRuntimeRequest) -> bool {
    let command_str = request
        .payload
        .get("command")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(Value::as_str)
        .unwrap_or("");

    const READ_ONLY_PREFIXES: &[&str] = &[
        "cat", "ls", "head", "tail", "grep", "rg", "find", "wc", "file", "stat", "du", "df",
        "echo", "pwd", "env", "printenv", "which", "whoami", "hostname", "uname", "date", "git log",
        "git status", "git diff", "git show", "git branch",
    ];

    READ_ONLY_PREFIXES
        .iter()
        .any(|prefix| command_str.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::{
        auto_resolve_request, decline_response, is_read_only_command, AutoResolutionPolicy,
        HeadlessTurnRunnerConfig,
    };
    use crate::models::PendingRuntimeRequest;

    fn make_request(kind: &str, payload: Value) -> PendingRuntimeRequest {
        PendingRuntimeRequest {
            request_id: "req-1".to_string(),
            request_kind: kind.to_string(),
            item_id: None,
            approval_id: None,
            title: None,
            summary: None,
            payload,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn decline_all_declines_command_execution() {
        let request = make_request("command_execution_request_approval", json!({}));
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["decision"], "decline");
    }

    #[test]
    fn decline_all_declines_file_change() {
        let request = make_request("file_change_request_approval", json!({}));
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["decision"], "decline");
    }

    #[test]
    fn decline_all_permissions_returns_empty() {
        let request = make_request("permissions_request_approval", json!({}));
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["permissions"], json!({}));
        assert_eq!(response["scope"], "turn");
    }

    #[test]
    fn decline_all_apply_patch() {
        let request = make_request("apply_patch_approval", json!({}));
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["decision"], "Denied");
    }

    #[test]
    fn decline_all_exec_command() {
        let request = make_request("exec_command_approval", json!({}));
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["decision"], "Denied");
    }

    #[test]
    fn decline_all_tool_input() {
        let request = make_request("tool_request_user_input", json!({}));
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["answers"], json!({}));
    }

    #[test]
    fn decline_all_elicitation_preserves_meta() {
        let meta = json!({"requestId": "abc-123"});
        let request = make_request(
            "mcp_server_elicitation_request",
            json!({"_meta": meta.clone()}),
        );
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["action"], "decline");
        assert!(response["content"].is_null());
        assert_eq!(response["_meta"], meta);
    }

    #[test]
    fn decline_all_elicitation_null_when_no_meta() {
        let request = make_request("mcp_server_elicitation_request", json!({}));
        let response = decline_response(&request).expect("should produce response");
        assert_eq!(response["action"], "decline");
        assert!(response["_meta"].is_null());
    }

    #[test]
    fn decline_all_returns_none_for_unknown_kind() {
        let request = make_request("some_unknown_kind", json!({}));
        assert!(decline_response(&request).is_none());
    }

    #[test]
    fn auto_resolve_decline_all_policy() {
        let policy = AutoResolutionPolicy::DeclineAll;
        let request = make_request("exec_command_approval", json!({}));
        let response = auto_resolve_request(&policy, &request).expect("should produce response");
        assert_eq!(response["decision"], "Denied");
    }

    #[test]
    fn auto_resolve_accept_read_only_approves_cat() {
        let policy = AutoResolutionPolicy::AcceptReadOnly;
        let request = make_request(
            "command_execution_request_approval",
            json!({"command": ["cat", "foo.txt"]}),
        );
        let response = auto_resolve_request(&policy, &request).expect("should produce response");
        assert_eq!(response["decision"], "approve");
    }

    #[test]
    fn auto_resolve_accept_read_only_declines_rm() {
        let policy = AutoResolutionPolicy::AcceptReadOnly;
        let request = make_request(
            "command_execution_request_approval",
            json!({"command": ["rm", "-rf", "/"]}),
        );
        let response = auto_resolve_request(&policy, &request).expect("should produce response");
        assert_eq!(response["decision"], "decline");
    }

    #[test]
    fn auto_resolve_accept_read_only_declines_file_change() {
        let policy = AutoResolutionPolicy::AcceptReadOnly;
        let request = make_request("file_change_request_approval", json!({}));
        let response = auto_resolve_request(&policy, &request).expect("should produce response");
        assert_eq!(response["decision"], "decline");
    }

    #[test]
    fn auto_resolve_custom_policy() {
        let policy = AutoResolutionPolicy::Custom(std::sync::Arc::new(|req| {
            if req.request_kind == "exec_command_approval" {
                Some(json!({ "decision": "approve" }))
            } else {
                None
            }
        }));
        let request = make_request("exec_command_approval", json!({}));
        let response = auto_resolve_request(&policy, &request).expect("should produce response");
        assert_eq!(response["decision"], "approve");

        let unknown = make_request("file_change_request_approval", json!({}));
        assert!(auto_resolve_request(&policy, &unknown).is_none());
    }

    #[test]
    fn is_read_only_command_detects_common_patterns() {
        let read = make_request(
            "command_execution_request_approval",
            json!({"command": ["cat", "file.txt"]}),
        );
        assert!(is_read_only_command(&read));

        let read_git = make_request(
            "command_execution_request_approval",
            json!({"command": ["git status"]}),
        );
        assert!(is_read_only_command(&read_git));

        let write = make_request(
            "command_execution_request_approval",
            json!({"command": ["rm", "-rf", "/"]}),
        );
        assert!(!is_read_only_command(&write));

        let empty = make_request("command_execution_request_approval", json!({}));
        assert!(!is_read_only_command(&empty));
    }

    #[test]
    fn default_config_has_sane_defaults() {
        let config = HeadlessTurnRunnerConfig::default();
        assert_eq!(config.timeout, std::time::Duration::from_secs(600));
        assert_eq!(config.poll_interval, std::time::Duration::from_secs(1));
        // Policy is DeclineAll — verified by matching.
        let request = make_request("exec_command_approval", json!({}));
        let response = auto_resolve_request(&config.policy, &request);
        assert!(response.is_some());
        assert_eq!(response.unwrap()["decision"], "Denied");
    }
}
