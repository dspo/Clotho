use crate::catalog;
use serde_json::json;
use tauri::ipc::Channel;
use tauri::{AppHandle, Runtime, State};

use crate::config;
use crate::error::Result;
use crate::events;
use crate::models::{
    AssistantTurnStreamEnvelope, AttachmentRef, CancelTurnAck, ConfigSelection,
    CreateThreadResponse, ListConfigFilesResponse, ListThreadsRequest, ListThreadsResponse,
    ResolvedConfig, ResumeTurnStreamAck, RuntimeCatalog, StartTurnAck,
    SubmitRuntimeRequestAck, ThreadSnapshot,
};
use crate::runtime;
use crate::session::{AssistantRuntimeState, StreamDispatch};

#[tauri::command]
pub fn list_threads(
    state: State<'_, AssistantRuntimeState>,
    limit: Option<usize>,
    cursor: Option<String>,
) -> Result<ListThreadsResponse> {
    Ok(state.list_threads(ListThreadsRequest { limit, cursor }))
}

#[tauri::command]
pub fn get_thread_snapshot(
    state: State<'_, AssistantRuntimeState>,
    thread_id: String,
) -> Result<ThreadSnapshot> {
    state.get_thread_snapshot(&thread_id)
}

#[tauri::command]
pub fn create_thread<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AssistantRuntimeState>,
    title: Option<String>,
    config_context: Option<ConfigSelection>,
) -> Result<CreateThreadResponse> {
    let response = state.create_thread(title, config_context);
    events::emit_threads_changed(&app, "created", Some(&response.thread_id));
    Ok(response)
}

#[tauri::command]
pub async fn start_turn<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AssistantRuntimeState>,
    thread_id: String,
    text: String,
    mode: String,
    attachments: Option<Vec<AttachmentRef>>,
    model_override: Option<String>,
    config_context: Option<ConfigSelection>,
    on_event: Channel<AssistantTurnStreamEnvelope>,
) -> Result<StartTurnAck> {
    let attachments = attachments.unwrap_or_default();
    let runtime_state = state.inner().clone();
    let started = runtime_state.start_turn(&thread_id, &text, config_context.clone(), on_event)?;
    let turn_id = started.turn_id.clone();
    let accepted_at = started.accepted_at.clone();
    let resolved_config_context = runtime_state.thread_config_selection(&thread_id)?;

    match runtime::start_runtime_turn(
        app.clone(),
        runtime_state.clone(),
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
            let StreamDispatch { item, subscribers } = runtime_state.push_stream_event(
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

#[tauri::command]
pub fn resume_turn_stream<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AssistantRuntimeState>,
    thread_id: String,
    turn_id: String,
    after_seq: Option<u64>,
    on_event: Channel<AssistantTurnStreamEnvelope>,
) -> Result<ResumeTurnStreamAck> {
    let dispatch = state.resume_turn_stream(&thread_id, &turn_id, after_seq, on_event.clone())?;
    for item in dispatch.items {
        let _ = on_event.send(item);
    }

    events::emit_status(&app, "connected");

    Ok(ResumeTurnStreamAck {
        thread_id,
        turn_id,
        resumed: dispatch.running,
    })
}

#[tauri::command]
pub async fn cancel_turn<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AssistantRuntimeState>,
    thread_id: String,
    turn_id: String,
) -> Result<CancelTurnAck> {
    let accepted = runtime::interrupt_runtime_turn(
        app.clone(),
        state.inner().clone(),
        thread_id.clone(),
        turn_id.clone(),
    )
    .await
    .unwrap_or(false);

    if accepted {
        events::emit_threads_changed(&app, "updated", Some(&thread_id));
    }

    Ok(CancelTurnAck {
        thread_id,
        turn_id,
        accepted,
    })
}

#[tauri::command]
pub async fn submit_runtime_request<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AssistantRuntimeState>,
    thread_id: String,
    turn_id: String,
    request_id: String,
    response: serde_json::Value,
) -> Result<SubmitRuntimeRequestAck> {
    let request_kind = runtime::submit_runtime_request_response(
        app.clone(),
        state.inner().clone(),
        thread_id,
        turn_id,
        request_id,
        response,
    )
    .await?;
    events::emit_threads_changed(&app, "updated", None);
    Ok(SubmitRuntimeRequestAck {
        accepted: true,
        request_kind,
    })
}

#[tauri::command]
pub fn list_config_files() -> Result<ListConfigFilesResponse> {
    Ok(config::list_config_files())
}

#[tauri::command]
pub fn resolve_config_profile(
    config_file_path: String,
    profile: Option<String>,
) -> Result<ResolvedConfig> {
    config::resolve_config_profile(config_file_path, profile)
}

#[tauri::command]
pub fn get_runtime_catalog<R: Runtime>(app: AppHandle<R>) -> Result<RuntimeCatalog> {
    Ok(catalog::runtime_catalog(&app))
}
