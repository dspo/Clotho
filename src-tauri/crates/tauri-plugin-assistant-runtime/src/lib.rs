mod audit;
mod catalog;
mod commands;
mod config;
mod db;
mod error;
mod events;
mod models;
mod native_tools;
mod proposal;
mod runtime;
mod session;

use serde_json::json;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

pub use error::{Error, Result};
pub use models::*;
pub use session::{AssistantRuntimeState, StartedTurn, StreamDispatch};

pub const LEGACY_PLUGIN_NAME: &str = "assistant-runtime";

#[derive(Clone, Copy)]
pub(crate) struct RuntimePluginMetadata {
    pub(crate) plugin_name: &'static str,
    pub(crate) status_event: &'static str,
    pub(crate) threads_changed_event: &'static str,
    pub(crate) debug_event: &'static str,
    pub(crate) audit_directory: &'static str,
}

impl RuntimePluginMetadata {
    fn for_plugin(plugin_name: &'static str) -> Self {
        match plugin_name {
            "agent-runtime" => Self {
                plugin_name,
                status_event: "agent-runtime://status",
                threads_changed_event: "agent-runtime://threads-changed",
                debug_event: "agent-runtime://debug",
                audit_directory: "agent-runtime",
            },
            _ => Self {
                plugin_name: LEGACY_PLUGIN_NAME,
                status_event: "assistant-runtime://status",
                threads_changed_event: "assistant-runtime://threads-changed",
                debug_event: "assistant-runtime://debug",
                audit_directory: LEGACY_PLUGIN_NAME,
            },
        }
    }
}

pub(crate) fn runtime_plugin_metadata<R: Runtime>(app: &AppHandle<R>) -> RuntimePluginMetadata {
    app.try_state::<RuntimePluginMetadata>()
        .map(|state| *state.inner())
        .unwrap_or(RuntimePluginMetadata::for_plugin(LEGACY_PLUGIN_NAME))
}

pub async fn start_headless_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    text: String,
    mode: String,
    attachments: Option<Vec<AttachmentRef>>,
    model_override: Option<String>,
    config_context: Option<ConfigSelection>,
) -> Result<StartTurnAck> {
    let attachments = attachments.unwrap_or_default();
    let started = state.start_background_turn(&thread_id, &text, config_context.clone())?;
    let turn_id = started.turn_id.clone();
    let accepted_at = started.accepted_at.clone();
    let resolved_config_context = state.thread_config_selection(&thread_id)?;

    match runtime::start_runtime_turn(
        app.clone(),
        state.clone(),
        thread_id.clone(),
        turn_id.clone(),
        text,
        attachments,
        mode,
        model_override,
        resolved_config_context,
    )
    .await
    {
        Ok(()) => {
            events::emit_threads_changed(&app, "updated", Some(&thread_id));
            Ok(StartTurnAck {
                thread_id,
                turn_id,
                accepted_at,
            })
        }
        Err(err) => {
            let StreamDispatch { item, subscribers } = state.push_stream_event(
                &thread_id,
                &turn_id,
                "plugin",
                "turn_failed",
                json!({
                    "code": "runtime_start_failed",
                    "message": err.to_string(),
                }),
            )?;
            for subscriber in subscribers {
                let _ = subscriber.send(item.clone());
            }
            events::emit_threads_changed(&app, "updated", Some(&thread_id));
            Err(err)
        }
    }
}

pub async fn resolve_runtime_request<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
    request_id: String,
    response: serde_json::Value,
) -> Result<String> {
    runtime::submit_runtime_request_response(app, state, thread_id, turn_id, request_id, response)
        .await
}

pub async fn interrupt_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
) -> Result<bool> {
    runtime::interrupt_runtime_turn(app, state, thread_id, turn_id).await
}

pub fn init_with_name<R: Runtime>(plugin_name: &'static str) -> TauriPlugin<R> {
    let metadata = RuntimePluginMetadata::for_plugin(plugin_name);
    Builder::new(metadata.plugin_name)
        .invoke_handler(tauri::generate_handler![
            commands::list_threads,
            commands::get_thread_snapshot,
            commands::create_thread,
            commands::start_turn,
            commands::resume_turn_stream,
            commands::cancel_turn,
            commands::submit_runtime_request,
            commands::list_config_files,
            commands::resolve_config_profile,
            commands::get_runtime_catalog,
        ])
        .setup(move |app, _api| {
            app.manage(AssistantRuntimeState::default());
            app.manage(metadata);
            Ok(())
        })
        .build()
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    init_with_name(LEGACY_PLUGIN_NAME)
}

#[cfg(test)]
mod tests {
    use super::RuntimePluginMetadata;

    #[test]
    fn agent_runtime_metadata_uses_agent_namespace() {
        let metadata = RuntimePluginMetadata::for_plugin("agent-runtime");
        assert_eq!(metadata.plugin_name, "agent-runtime");
        assert_eq!(metadata.status_event, "agent-runtime://status");
        assert_eq!(metadata.threads_changed_event, "agent-runtime://threads-changed");
        assert_eq!(metadata.debug_event, "agent-runtime://debug");
        assert_eq!(metadata.audit_directory, "agent-runtime");
    }

    #[test]
    fn assistant_runtime_metadata_preserves_legacy_namespace() {
        let metadata = RuntimePluginMetadata::for_plugin("assistant-runtime");
        assert_eq!(metadata.plugin_name, "assistant-runtime");
        assert_eq!(metadata.status_event, "assistant-runtime://status");
        assert_eq!(metadata.audit_directory, "assistant-runtime");
    }
}
