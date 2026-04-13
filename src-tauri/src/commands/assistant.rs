use clotho_domain::{apply_proposal, simulate_proposal, ProposalPayload, ProposalSimulationReport};
use serde::Serialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_agent_runtime::{AssistantRuntimeState, AttachmentRef, StreamDispatch};
use uuid::Uuid;

use crate::assistant::{automation, proposal};
use crate::commands::lock_db;
use crate::error::AppError;
use crate::state::{AppState, AssistantAutomationHandle, ProposalCache, ProposalCacheKey};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProposalAck {
    pub accepted: bool,
    pub apply_run_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageLocalImageResponse {
    pub attachment: AttachmentRef,
}

#[tauri::command]
pub async fn assistant_prepare_turn_text(
    runtime_state: State<'_, AssistantRuntimeState>,
    thread_id: String,
    text: String,
    mode: String,
) -> Result<String, AppError> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(
            "assistant turn text must not be empty".to_string(),
        ));
    }

    let include_global_soul = runtime_state
        .get_thread_snapshot(&thread_id)
        .await?
        .blocks
        .is_empty();

    Ok(crate::assistant::runtime_host::compose_user_turn_text(
        trimmed,
        &mode,
        include_global_soul,
    ))
}

#[tauri::command]
pub async fn assistant_apply_proposal<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    runtime_state: State<'_, AssistantRuntimeState>,
    thread_id: String,
    turn_id: String,
    proposal_id: String,
    proposal: Option<ProposalPayload>,
) -> Result<ApplyProposalAck, AppError> {
    let runtime_state = runtime_state.inner().clone();
    let proposal = load_turn_proposal(
        state.inner(),
        &runtime_state,
        &thread_id,
        &turn_id,
        &proposal_id,
        proposal,
    )
    .await?;
    let apply_run_id = Uuid::new_v4().to_string();

    dispatch_apply_event(
        &app,
        &runtime_state,
        &thread_id,
        &turn_id,
        "proposal_apply_started",
        json!({
            "proposalId": proposal.proposal_id,
            "applyRunId": apply_run_id,
            "summary": proposal.summary,
        }),
    )
    .await?;

    let result = {
        let mut db = lock_db(&state)?;
        apply_proposal(&mut db, &proposal)
    };

    match result {
        Ok(report) => {
            dispatch_apply_event(
                &app,
                &runtime_state,
                &thread_id,
                &turn_id,
                "proposal_apply_finished",
                json!({
                    "proposalId": proposal.proposal_id,
                    "applyRunId": apply_run_id,
                    "summary": proposal.summary,
                    "status": "applied",
                    "appliedActions": report.applied_actions,
                }),
            )
            .await?;

            Ok(ApplyProposalAck {
                accepted: true,
                apply_run_id,
            })
        }
        Err(error) => {
            dispatch_apply_event(
                &app,
                &runtime_state,
                &thread_id,
                &turn_id,
                "proposal_apply_finished",
                json!({
                    "proposalId": proposal.proposal_id,
                    "applyRunId": apply_run_id,
                    "summary": proposal.summary,
                    "status": "failed",
                    "error": error.to_string(),
                }),
            )
            .await?;

            Err(error.into())
        }
    }
}

#[tauri::command]
pub async fn assistant_simulate_proposal(
    state: State<'_, AppState>,
    runtime_state: State<'_, AssistantRuntimeState>,
    thread_id: String,
    turn_id: String,
    proposal_id: String,
    proposal: Option<ProposalPayload>,
) -> Result<ProposalSimulationReport, AppError> {
    let runtime_state = runtime_state.inner().clone();
    let proposal = load_turn_proposal(
        state.inner(),
        &runtime_state,
        &thread_id,
        &turn_id,
        &proposal_id,
        proposal,
    )
    .await?;
    let db = lock_db(&state)?;
    Ok(simulate_proposal(&db, &proposal))
}

#[tauri::command]
pub fn assistant_get_daily_automation_status(
    automation_handle: State<'_, AssistantAutomationHandle>,
) -> Result<automation::DailyAutomationStatus, AppError> {
    automation::get_daily_automation_status(automation_handle.inner())
}

#[tauri::command]
pub fn assistant_run_daily_automation_now(
    automation_handle: State<'_, AssistantAutomationHandle>,
) -> Result<automation::DailyAutomationRunNowAck, AppError> {
    automation::enqueue_manual_run(automation_handle.inner())
}

#[tauri::command]
pub fn assistant_stage_local_image<R: Runtime>(
    app: AppHandle<R>,
    filename: String,
    mime_type: Option<String>,
    data: Vec<u8>,
) -> Result<StageLocalImageResponse, AppError> {
    let trimmed_filename = filename.trim();
    if trimmed_filename.is_empty() {
        return Err(AppError::InvalidInput(
            "attachment filename must not be empty".to_string(),
        ));
    }
    if data.is_empty() {
        return Err(AppError::InvalidInput(
            "attachment file is empty".to_string(),
        ));
    }
    const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
    if data.len() > MAX_IMAGE_BYTES {
        return Err(AppError::InvalidInput(format!(
            "attachment exceeds {MAX_IMAGE_BYTES} bytes limit"
        )));
    }

    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        AppError::InvalidInput(format!("failed to resolve app data dir: {error}"))
    })?;
    let attachments_dir = app_data_dir.join("assistant-attachments");
    std::fs::create_dir_all(&attachments_dir).map_err(io_error)?;

    let extension = sanitized_extension(trimmed_filename, mime_type.as_deref());
    let stored_filename = if extension.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        format!("{}.{}", Uuid::new_v4(), extension)
    };
    let path = attachments_dir.join(stored_filename);
    std::fs::write(&path, data).map_err(io_error)?;

    Ok(StageLocalImageResponse {
        attachment: AttachmentRef {
            kind: Some("local_image".to_string()),
            id: None,
            name: Some(trimmed_filename.to_string()),
            mime_type,
            path: Some(path_to_string(&path)?),
        },
    })
}

async fn load_turn_proposal(
    state: &AppState,
    runtime_state: &AssistantRuntimeState,
    thread_id: &str,
    turn_id: &str,
    proposal_id: &str,
    proposal: Option<ProposalPayload>,
) -> Result<ProposalPayload, AppError> {
    if let Some(proposal) = proposal {
        let proposal = validate_proposal_identity(proposal, thread_id, turn_id, proposal_id)?;
        cache_proposal(state, proposal.clone())?;
        return Ok(proposal);
    }

    if let Some(proposal) = load_cached_proposal(state, thread_id, turn_id, proposal_id)? {
        return Ok(proposal);
    }

    let Some((_message_id, text)) = runtime_state
        .latest_assistant_message_for_turn(thread_id, turn_id)
        .await?
    else {
        return Err(AppError::NotFound(format!(
            "assistant message for thread `{thread_id}` turn `{turn_id}` was not found"
        )));
    };

    let extracted =
        proposal::extract_proposal_from_message(&text, thread_id, turn_id).ok_or_else(|| {
            AppError::NotFound(format!(
                "proposal `{proposal_id}` was not found in thread `{thread_id}` turn `{turn_id}`"
            ))
        })?;

    let proposal = validate_proposal_identity(extracted.proposal, thread_id, turn_id, proposal_id)?;
    cache_proposal(state, proposal.clone())?;

    Ok(proposal)
}

fn validate_proposal_identity(
    proposal: ProposalPayload,
    thread_id: &str,
    turn_id: &str,
    proposal_id: &str,
) -> Result<ProposalPayload, AppError> {
    if proposal.proposal_id != proposal_id {
        return Err(AppError::Conflict(format!(
            "proposal `{proposal_id}` does not belong to thread `{thread_id}` turn `{turn_id}`"
        )));
    }
    if proposal.thread_id != thread_id || proposal.turn_id != turn_id {
        return Err(AppError::Conflict(format!(
            "proposal `{proposal_id}` payload does not match thread `{thread_id}` turn `{turn_id}`"
        )));
    }
    Ok(proposal)
}

fn load_cached_proposal(
    state: &AppState,
    thread_id: &str,
    turn_id: &str,
    proposal_id: &str,
) -> Result<Option<ProposalPayload>, AppError> {
    let mut cache = lock_proposal_cache(state)?;
    Ok(cache.get(&ProposalCacheKey::new(thread_id, turn_id, proposal_id)))
}

fn cache_proposal(state: &AppState, proposal: ProposalPayload) -> Result<(), AppError> {
    let key = ProposalCacheKey::new(
        &proposal.thread_id,
        &proposal.turn_id,
        &proposal.proposal_id,
    );
    let mut cache = lock_proposal_cache(state)?;
    cache.insert(key, proposal);
    Ok(())
}

fn lock_proposal_cache(
    state: &AppState,
) -> Result<std::sync::MutexGuard<'_, ProposalCache>, AppError> {
    state
        .proposal_cache
        .lock()
        .map_err(|_| AppError::Runtime("proposal cache lock poisoned".to_string()))
}

async fn dispatch_apply_event<R: Runtime, T: Serialize>(
    _app: &AppHandle<R>,
    runtime_state: &AssistantRuntimeState,
    thread_id: &str,
    turn_id: &str,
    kind: &str,
    payload: T,
) -> Result<(), AppError> {
    let StreamDispatch { item, subscribers } = runtime_state
        .push_stream_event(thread_id, turn_id, "apply", kind, payload)
        .await?;
    for subscriber in subscribers {
        let _ = subscriber.send(item.clone());
    }
    Ok(())
}

fn sanitized_extension(filename: &str, mime_type: Option<&str>) -> String {
    let from_filename = Path::new(filename)
        .file_name()
        .and_then(|value| value.to_str())
        .and_then(|value| {
            value
                .split_once('.')
                .filter(|(base, extension)| !base.is_empty() && !extension.is_empty())
                .map(|(_, extension)| extension)
        })
        .unwrap_or_default();
    let candidate = if !from_filename.is_empty() {
        from_filename
    } else {
        match mime_type.unwrap_or_default() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            "image/bmp" => "bmp",
            "image/tiff" => "tiff",
            _ => "",
        }
    };

    candidate
        .split('.')
        .filter_map(|segment| {
            let sanitized = segment
                .chars()
                .filter(|value| value.is_ascii_alphanumeric())
                .collect::<String>()
                .to_lowercase();
            if sanitized.is_empty() {
                None
            } else {
                Some(sanitized)
            }
        })
        .collect::<Vec<_>>()
        .join(".")
}

fn path_to_string(path: &PathBuf) -> Result<String, AppError> {
    path.to_str().map(str::to_string).ok_or_else(|| {
        AppError::InvalidInput(format!(
            "attachment path contains non-utf8 characters: {}",
            path.display()
        ))
    })
}

fn io_error(error: std::io::Error) -> AppError {
    AppError::Runtime(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::sanitized_extension;

    #[test]
    fn sanitized_extension_preserves_multi_part_suffixes() {
        assert_eq!(sanitized_extension("archive.tar.gz", None), "tar.gz");
    }

    #[test]
    fn sanitized_extension_ignores_hidden_filename_prefixes() {
        assert_eq!(sanitized_extension(".env", None), "");
    }
}
