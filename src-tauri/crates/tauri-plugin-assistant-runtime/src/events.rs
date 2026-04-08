use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

use crate::models::AssistantStatusEventEnvelope;

pub const STATUS_EVENT: &str = "assistant-runtime://status";
pub const THREADS_CHANGED_EVENT: &str = "assistant-runtime://threads-changed";
pub const DEBUG_EVENT: &str = "assistant-runtime://debug";

fn envelope(kind: &str, payload: serde_json::Value) -> AssistantStatusEventEnvelope {
    AssistantStatusEventEnvelope {
        event_id: Uuid::new_v4().to_string(),
        emitted_at: Utc::now().to_rfc3339(),
        source: "plugin".to_string(),
        r#type: kind.to_string(),
        payload,
    }
}

pub fn emit_status<R: Runtime>(app: &AppHandle<R>, state: &str) {
    let _ = app.emit(STATUS_EVENT, envelope("connection_status", json!({ "state": state })));
}

pub fn emit_threads_changed<R: Runtime>(
    app: &AppHandle<R>,
    reason: &str,
    thread_id: Option<&str>,
) {
    let _ = app.emit(
        THREADS_CHANGED_EVENT,
        envelope(
            "threads_changed",
            json!({
                "reason": reason,
                "threadId": thread_id,
            }),
        ),
    );
}

pub fn emit_debug<R: Runtime>(app: &AppHandle<R>, message: impl Into<String>) {
    let _ = app.emit(
        DEBUG_EVENT,
        envelope(
            "debug_notice",
            json!({
                "message": message.into(),
            }),
        ),
    );
}
