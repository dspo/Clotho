use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

use crate::runtime_plugin_metadata;
use crate::models::AssistantStatusEventEnvelope;

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
    let metadata = runtime_plugin_metadata(app);
    let _ = app.emit(
        metadata.status_event,
        envelope("connection_status", json!({ "state": state })),
    );
}

pub fn emit_threads_changed<R: Runtime>(
    app: &AppHandle<R>,
    reason: &str,
    thread_id: Option<&str>,
) {
    let metadata = runtime_plugin_metadata(app);
    let _ = app.emit(
        metadata.threads_changed_event,
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
    let metadata = runtime_plugin_metadata(app);
    let _ = app.emit(
        metadata.debug_event,
        envelope(
            "debug_notice",
            json!({
                "message": message.into(),
            }),
        ),
    );
}
