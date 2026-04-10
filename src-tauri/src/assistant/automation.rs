use std::sync::MutexGuard;
use std::time::{Duration, Instant};

use chrono::{DateTime, Local, NaiveTime, TimeZone, Utc};
use clotho_domain::{DomainError, ProposalPayload};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_agent_runtime::{
    start_headless_turn, AssistantRuntimeState, AssistantStatusEventEnvelope, ConfigSelection,
    Error as RuntimeStateError, PendingRuntimeRequest,
};
use uuid::Uuid;

use super::runtime_host;
use crate::assistant::proposal;
use crate::error::AppError;
use crate::state::AssistantAutomationHandle;

const AUTOMATION_KIND_DAILY_SCHEDULER: &str = "daily_scheduler";
const DEFAULT_AUTOMATION_LOCAL_TIME: &str = "09:00";
const DEFAULT_RETRY_DELAY_MINUTES: i64 = 15;
const DEFAULT_MAX_ATTEMPTS: i64 = 3;
const WORKER_POLL_INTERVAL_SECONDS: u64 = 60;
const RUN_TIMEOUT_SECONDS: u64 = 600;
const STALE_RUNNING_MINUTES: i64 = 30;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAutomationConfig {
    pub enabled: bool,
    pub local_time: String,
    pub config_file_path: Option<String>,
    pub config_profile: Option<String>,
    pub max_attempts: i64,
    pub retry_delay_minutes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAutomationRun {
    pub run_id: String,
    pub run_key: String,
    pub automation_kind: String,
    pub trigger_kind: String,
    pub run_date: Option<String>,
    pub status: String,
    pub attempt_count: i64,
    pub scheduled_for: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub next_retry_at: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub proposal_id: Option<String>,
    pub summary: Option<String>,
    pub error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAutomationStatus {
    pub config: DailyAutomationConfig,
    pub active_run: Option<DailyAutomationRun>,
    pub last_completed_run: Option<DailyAutomationRun>,
    pub recent_runs: Vec<DailyAutomationRun>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAutomationRunNowAck {
    pub accepted: bool,
    pub run_id: String,
}

pub fn spawn_worker<R: Runtime + 'static>(
    app: AppHandle<R>,
    runtime_state: AssistantRuntimeState,
    handle: AssistantAutomationHandle,
) {
    tauri::async_runtime::spawn(async move {
        run_worker_loop(app, runtime_state, handle).await;
    });
}

pub fn notify_worker(handle: &AssistantAutomationHandle) {
    handle.trigger.notify_one();
}

pub fn get_daily_automation_status(
    handle: &AssistantAutomationHandle,
) -> Result<DailyAutomationStatus, AppError> {
    let db = lock_db(handle)?;
    load_status(&db)
}

pub fn enqueue_manual_run(
    handle: &AssistantAutomationHandle,
) -> Result<DailyAutomationRunNowAck, AppError> {
    let run_id = {
        let db = lock_db(handle)?;
        insert_manual_run(&db)?
    };
    notify_worker(handle);
    Ok(DailyAutomationRunNowAck {
        accepted: true,
        run_id,
    })
}

async fn run_worker_loop<R: Runtime>(
    app: AppHandle<R>,
    runtime_state: AssistantRuntimeState,
    handle: AssistantAutomationHandle,
) {
    loop {
        if handle.shutdown.is_cancelled() {
            break;
        }

        if let Err(error) = process_available_runs(&app, &runtime_state, &handle).await {
            let message = error.to_string();
            let _ = app.emit(
                "agent-runtime://debug",
                AssistantStatusEventEnvelope {
                    event_id: Uuid::new_v4().to_string(),
                    emitted_at: Utc::now().to_rfc3339(),
                    source: "automation".to_string(),
                    r#type: "debug_notice".to_string(),
                    payload: json!({ "message": format!("daily automation worker error: {message}") }),
                },
            );
        }

        tokio::select! {
            _ = handle.shutdown.cancelled() => break,
            _ = handle.trigger.notified() => {}
            _ = tokio::time::sleep(Duration::from_secs(WORKER_POLL_INTERVAL_SECONDS)) => {}
        }
    }
}

async fn process_available_runs<R: Runtime>(
    app: &AppHandle<R>,
    runtime_state: &AssistantRuntimeState,
    handle: &AssistantAutomationHandle,
) -> Result<(), AppError> {
    loop {
        if handle.shutdown.is_cancelled() {
            return Ok(());
        }

        let config = {
            let db = lock_db(handle)?;
            load_config(&db)?
        };

        let next_run = {
            let db = lock_db(handle)?;
            claim_next_due_run(&db, &config)?
        };

        let Some(run) = next_run else {
            return Ok(());
        };

        if let Err(error) = execute_run(app, runtime_state, handle, &config, run.clone()).await {
            let db = lock_db(handle)?;
            mark_run_failed(
                &db,
                &run.run_id,
                run.attempt_count,
                &config,
                error.to_string(),
            )?;
        }
    }
}

async fn execute_run<R: Runtime>(
    app: &AppHandle<R>,
    runtime_state: &AssistantRuntimeState,
    handle: &AssistantAutomationHandle,
    config: &DailyAutomationConfig,
    run: DailyAutomationRun,
) -> Result<(), AppError> {
    let config_context = build_config_selection(config);
    let thread = runtime_state
        .create_thread(Some(build_thread_title(&run)), config_context.clone())
        .await;
    let prompt = runtime_host::compose_daily_scheduler_turn_text(
        &Local::now().format("%Y-%m-%d %H:%M").to_string(),
    );
    let started = start_headless_turn(
        app.clone(),
        runtime_state.clone(),
        thread.thread_id.clone(),
        prompt,
        "plan".to_string(),
        None,
        None,
        config_context,
    )
    .await
    .map_err(map_runtime_state_error)?;

    {
        let db = lock_db(handle)?;
        bind_turn_to_run(&db, &run.run_id, &thread.thread_id, &started.turn_id)?;
    }

    let deadline = Instant::now() + Duration::from_secs(RUN_TIMEOUT_SECONDS);
    loop {
        auto_resolve_pending_requests(app, runtime_state, &thread.thread_id, &started.turn_id)
            .await?;

        let status = runtime_state
            .turn_status(&thread.thread_id, &started.turn_id)
            .await
            .map_err(map_runtime_state_error)?;
        match status.as_str() {
            "running" => {
                if Instant::now() >= deadline {
                    let _ = tauri_plugin_agent_runtime::interrupt_turn(
                        app.clone(),
                        runtime_state.clone(),
                        thread.thread_id.clone(),
                        started.turn_id.clone(),
                    )
                    .await;
                    let db = lock_db(handle)?;
                    mark_run_failed(
                        &db,
                        &run.run_id,
                        run.attempt_count,
                        config,
                        "daily automation timed out and was interrupted".to_string(),
                    )?;
                    return Ok(());
                }

                tokio::select! {
                    _ = handle.shutdown.cancelled() => {
                        let _ = tauri_plugin_agent_runtime::interrupt_turn(
                            app.clone(),
                            runtime_state.clone(),
                            thread.thread_id.clone(),
                            started.turn_id.clone(),
                        )
                        .await;
                        let db = lock_db(handle)?;
                        mark_run_failed(
                            &db,
                            &run.run_id,
                            run.attempt_count,
                            config,
                            "daily automation interrupted during app shutdown".to_string(),
                        )?;
                        return Ok(());
                    }
                    _ = tokio::time::sleep(Duration::from_secs(1)) => {}
                }
            }
            "completed" => {
                let proposal =
                    extract_turn_proposal(runtime_state, &thread.thread_id, &started.turn_id)
                        .await?;
                let Some(proposal) = proposal else {
                    let db = lock_db(handle)?;
                    mark_run_failed(
                        &db,
                        &run.run_id,
                        run.attempt_count,
                        config,
                        "daily automation completed without producing a proposal".to_string(),
                    )?;
                    return Ok(());
                };

                let db = lock_db(handle)?;
                mark_run_completed(&db, &run.run_id, &proposal)?;
                return Ok(());
            }
            "failed" => {
                let db = lock_db(handle)?;
                mark_run_failed(
                    &db,
                    &run.run_id,
                    run.attempt_count,
                    config,
                    "daily automation turn failed".to_string(),
                )?;
                return Ok(());
            }
            "cancelled" => {
                let db = lock_db(handle)?;
                mark_run_failed(
                    &db,
                    &run.run_id,
                    run.attempt_count,
                    config,
                    "daily automation turn was cancelled".to_string(),
                )?;
                return Ok(());
            }
            _ => {
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
}

async fn auto_resolve_pending_requests<R: Runtime>(
    app: &AppHandle<R>,
    runtime_state: &AssistantRuntimeState,
    thread_id: &str,
    turn_id: &str,
) -> Result<(), AppError> {
    let pending = runtime_state
        .pending_requests_for_turn(thread_id, turn_id)
        .await
        .map_err(map_runtime_state_error)?;

    for request in pending {
        let Some(response) = auto_response_for_request(&request) else {
            continue;
        };
        tauri_plugin_agent_runtime::resolve_runtime_request(
            app.clone(),
            runtime_state.clone(),
            thread_id.to_string(),
            turn_id.to_string(),
            request.request_id,
            response,
        )
        .await
        .map_err(map_runtime_state_error)?;
    }

    Ok(())
}

fn auto_response_for_request(request: &PendingRuntimeRequest) -> Option<Value> {
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

fn build_thread_title(run: &DailyAutomationRun) -> String {
    match run.run_date.as_deref() {
        Some(run_date) => format!("Daily Scheduler {run_date}"),
        None => "Daily Scheduler Manual Run".to_string(),
    }
}

fn build_config_selection(config: &DailyAutomationConfig) -> Option<ConfigSelection> {
    config
        .config_file_path
        .as_ref()
        .map(|config_file_path| ConfigSelection {
            config_id: Some(config_file_path.clone()),
            profile: config.config_profile.clone(),
        })
}

async fn extract_turn_proposal(
    runtime_state: &AssistantRuntimeState,
    thread_id: &str,
    turn_id: &str,
) -> Result<Option<ProposalPayload>, AppError> {
    let Some((_message_id, text)) = runtime_state
        .latest_assistant_message_for_turn(thread_id, turn_id)
        .await
        .map_err(map_runtime_state_error)?
    else {
        return Ok(None);
    };

    Ok(
        proposal::extract_proposal_from_message(&text, thread_id, turn_id)
            .map(|extracted| extracted.proposal),
    )
}

fn load_status(db: &rusqlite::Connection) -> Result<DailyAutomationStatus, AppError> {
    let config = load_config(db)?;
    let active_run = load_single_run(
        db,
        "
        SELECT id, run_key, automation_kind, trigger_kind, run_date, status, attempt_count,
               scheduled_for, started_at, completed_at, next_retry_at, thread_id, turn_id,
               proposal_id, summary, error, updated_at
        FROM assistant_automation_runs
        WHERE status IN ('queued', 'running')
        ORDER BY updated_at DESC
        LIMIT 1
        ",
    )?;
    let last_completed_run = load_single_run(
        db,
        "
        SELECT id, run_key, automation_kind, trigger_kind, run_date, status, attempt_count,
               scheduled_for, started_at, completed_at, next_retry_at, thread_id, turn_id,
               proposal_id, summary, error, updated_at
        FROM assistant_automation_runs
        WHERE status = 'completed'
        ORDER BY completed_at DESC, updated_at DESC
        LIMIT 1
        ",
    )?;
    let recent_runs = load_recent_runs(db, 12)?;

    Ok(DailyAutomationStatus {
        config,
        active_run,
        last_completed_run,
        recent_runs,
    })
}

fn load_recent_runs(
    db: &rusqlite::Connection,
    limit: usize,
) -> Result<Vec<DailyAutomationRun>, AppError> {
    let mut stmt = db.prepare(
        "
        SELECT id, run_key, automation_kind, trigger_kind, run_date, status, attempt_count,
               scheduled_for, started_at, completed_at, next_retry_at, thread_id, turn_id,
               proposal_id, summary, error, updated_at
        FROM assistant_automation_runs
        ORDER BY updated_at DESC
        LIMIT ?1
        ",
    )?;
    let rows = stmt.query_map([limit as i64], map_run_row)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

fn load_single_run(
    db: &rusqlite::Connection,
    sql: &str,
) -> Result<Option<DailyAutomationRun>, AppError> {
    let mut stmt = db.prepare(sql)?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_run_row(row)?))
    } else {
        Ok(None)
    }
}

fn map_run_row(row: &rusqlite::Row<'_>) -> Result<DailyAutomationRun, rusqlite::Error> {
    Ok(DailyAutomationRun {
        run_id: row.get("id")?,
        run_key: row.get("run_key")?,
        automation_kind: row.get("automation_kind")?,
        trigger_kind: row.get("trigger_kind")?,
        run_date: row.get("run_date")?,
        status: row.get("status")?,
        attempt_count: row.get("attempt_count")?,
        scheduled_for: row.get("scheduled_for")?,
        started_at: row.get("started_at")?,
        completed_at: row.get("completed_at")?,
        next_retry_at: row.get("next_retry_at")?,
        thread_id: row.get("thread_id")?,
        turn_id: row.get("turn_id")?,
        proposal_id: row.get("proposal_id")?,
        summary: row.get("summary")?,
        error: row.get("error")?,
        updated_at: row.get("updated_at")?,
    })
}

fn load_config(db: &rusqlite::Connection) -> Result<DailyAutomationConfig, AppError> {
    Ok(DailyAutomationConfig {
        enabled: load_setting_bool(db, "assistant_automation_enabled", false)?,
        local_time: load_setting_string(
            db,
            "assistant_automation_local_time",
            DEFAULT_AUTOMATION_LOCAL_TIME,
        )?,
        config_file_path: load_optional_setting_string(
            db,
            "assistant_automation_config_file_path",
        )?,
        config_profile: load_optional_setting_string(db, "assistant_automation_config_profile")?,
        max_attempts: DEFAULT_MAX_ATTEMPTS,
        retry_delay_minutes: DEFAULT_RETRY_DELAY_MINUTES,
    })
}

fn load_setting_bool(
    db: &rusqlite::Connection,
    key: &str,
    default: bool,
) -> Result<bool, AppError> {
    let value = load_optional_setting_string(db, key)?;
    Ok(value
        .as_deref()
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(default))
}

fn load_setting_string(
    db: &rusqlite::Connection,
    key: &str,
    default: &str,
) -> Result<String, AppError> {
    Ok(load_optional_setting_string(db, key)?.unwrap_or_else(|| default.to_string()))
}

fn load_optional_setting_string(
    db: &rusqlite::Connection,
    key: &str,
) -> Result<Option<String>, AppError> {
    let value = db
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    Ok(value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

fn claim_next_due_run(
    db: &rusqlite::Connection,
    config: &DailyAutomationConfig,
) -> Result<Option<DailyAutomationRun>, AppError> {
    recover_stale_running_runs(db, config)?;
    ensure_scheduled_run_for_today(db, config)?;

    if let Some(run) = claim_queued_run(db)? {
        return Ok(Some(run));
    }

    claim_retryable_failed_run(db, config)
}

fn recover_stale_running_runs(
    db: &rusqlite::Connection,
    config: &DailyAutomationConfig,
) -> Result<(), AppError> {
    let cutoff = (Utc::now() - chrono::Duration::minutes(STALE_RUNNING_MINUTES)).to_rfc3339();
    let mut stmt = db.prepare(
        "
        SELECT id, attempt_count
        FROM assistant_automation_runs
        WHERE status = 'running'
          AND started_at IS NOT NULL
          AND started_at < ?1
        ",
    )?;
    let rows = stmt.query_map([cutoff], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in rows {
        let (run_id, attempt_count) = row?;
        mark_run_failed(
            db,
            &run_id,
            attempt_count,
            config,
            "stale running automation run recovered for retry".to_string(),
        )?;
    }
    Ok(())
}

fn ensure_scheduled_run_for_today(
    db: &rusqlite::Connection,
    config: &DailyAutomationConfig,
) -> Result<(), AppError> {
    if !config.enabled {
        return Ok(());
    }

    let Some(scheduled_for) = scheduled_time_for_today(&config.local_time) else {
        return Ok(());
    };
    let now = Local::now();
    if now < scheduled_for {
        return Ok(());
    }

    let run_date = now.format("%Y-%m-%d").to_string();
    let run_key = format!("daily:{AUTOMATION_KIND_DAILY_SCHEDULER}:{run_date}");
    let exists = db
        .query_row(
            "SELECT COUNT(*) FROM assistant_automation_runs WHERE run_key = ?1",
            [run_key.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;
    if exists {
        return Ok(());
    }

    let now_utc = Utc::now().to_rfc3339();
    let run_id = Uuid::new_v4().to_string();
    db.execute(
        "
        INSERT INTO assistant_automation_runs (
            id, run_key, automation_kind, trigger_kind, run_date, status,
            attempt_count, scheduled_for, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, 'scheduled', ?4, 'queued', 0, ?5, ?6, ?6)
        ",
        rusqlite::params![
            run_id,
            run_key,
            AUTOMATION_KIND_DAILY_SCHEDULER,
            run_date,
            scheduled_for.to_rfc3339(),
            now_utc,
        ],
    )?;

    Ok(())
}

fn insert_manual_run(db: &rusqlite::Connection) -> Result<String, AppError> {
    let run_id = Uuid::new_v4().to_string();
    let run_key = format!("manual:{AUTOMATION_KIND_DAILY_SCHEDULER}:{run_id}");
    let now = Utc::now().to_rfc3339();
    db.execute(
        "
        INSERT INTO assistant_automation_runs (
            id, run_key, automation_kind, trigger_kind, status,
            attempt_count, scheduled_for, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, 'manual', 'queued', 0, ?4, ?4, ?4)
        ",
        rusqlite::params![run_id, run_key, AUTOMATION_KIND_DAILY_SCHEDULER, now],
    )?;
    Ok(run_id)
}

fn claim_queued_run(db: &rusqlite::Connection) -> Result<Option<DailyAutomationRun>, AppError> {
    let mut stmt = db.prepare(
        "
        SELECT id, run_key, automation_kind, trigger_kind, run_date, status, attempt_count,
               scheduled_for, started_at, completed_at, next_retry_at, thread_id, turn_id,
               proposal_id, summary, error, updated_at
        FROM assistant_automation_runs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        ",
    )?;
    let mut rows = stmt.query([])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let run = map_run_row(row)?;
    let now = Utc::now().to_rfc3339();
    db.execute(
        "
        UPDATE assistant_automation_runs
        SET status = 'running',
            attempt_count = attempt_count + 1,
            started_at = ?2,
            completed_at = NULL,
            error = NULL,
            next_retry_at = NULL,
            updated_at = ?2
        WHERE id = ?1
        ",
        rusqlite::params![run.run_id, now],
    )?;
    load_run_by_id(db, &run.run_id)
}

fn claim_retryable_failed_run(
    db: &rusqlite::Connection,
    config: &DailyAutomationConfig,
) -> Result<Option<DailyAutomationRun>, AppError> {
    let now = Utc::now().to_rfc3339();
    let mut stmt = db.prepare(
        "
        SELECT id, run_key, automation_kind, trigger_kind, run_date, status, attempt_count,
               scheduled_for, started_at, completed_at, next_retry_at, thread_id, turn_id,
               proposal_id, summary, error, updated_at
        FROM assistant_automation_runs
        WHERE status = 'failed'
          AND attempt_count < ?1
          AND next_retry_at IS NOT NULL
          AND next_retry_at <= ?2
        ORDER BY next_retry_at ASC
        LIMIT 1
        ",
    )?;
    let mut rows = stmt.query(rusqlite::params![config.max_attempts, now])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let run = map_run_row(row)?;
    db.execute(
        "
        UPDATE assistant_automation_runs
        SET status = 'running',
            attempt_count = attempt_count + 1,
            started_at = ?2,
            completed_at = NULL,
            error = NULL,
            next_retry_at = NULL,
            updated_at = ?2
        WHERE id = ?1
        ",
        rusqlite::params![run.run_id, now],
    )?;
    load_run_by_id(db, &run.run_id)
}

fn load_run_by_id(
    db: &rusqlite::Connection,
    run_id: &str,
) -> Result<Option<DailyAutomationRun>, AppError> {
    let mut stmt = db.prepare(
        "
        SELECT id, run_key, automation_kind, trigger_kind, run_date, status, attempt_count,
               scheduled_for, started_at, completed_at, next_retry_at, thread_id, turn_id,
               proposal_id, summary, error, updated_at
        FROM assistant_automation_runs
        WHERE id = ?1
        LIMIT 1
        ",
    )?;
    let mut rows = stmt.query([run_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_run_row(row)?))
    } else {
        Ok(None)
    }
}

fn bind_turn_to_run(
    db: &rusqlite::Connection,
    run_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    db.execute(
        "
        UPDATE assistant_automation_runs
        SET thread_id = ?2,
            turn_id = ?3,
            updated_at = ?4
        WHERE id = ?1
        ",
        rusqlite::params![run_id, thread_id, turn_id, now],
    )?;
    Ok(())
}

fn mark_run_completed(
    db: &rusqlite::Connection,
    run_id: &str,
    proposal: &ProposalPayload,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let proposal_json = serde_json::to_string(proposal)
        .map_err(|error| DomainError::InvalidInput(error.to_string()))?;
    db.execute(
        "
        UPDATE assistant_automation_runs
        SET status = 'completed',
            completed_at = ?2,
            proposal_id = ?3,
            summary = ?4,
            error = NULL,
            proposal_json = ?5,
            updated_at = ?2
        WHERE id = ?1
        ",
        rusqlite::params![
            run_id,
            now,
            proposal.proposal_id,
            proposal.summary,
            proposal_json,
        ],
    )?;
    Ok(())
}

fn mark_run_failed(
    db: &rusqlite::Connection,
    run_id: &str,
    attempt_count: i64,
    config: &DailyAutomationConfig,
    error: String,
) -> Result<(), AppError> {
    let now = Utc::now();
    let next_retry_at = if attempt_count < config.max_attempts {
        Some((now + chrono::Duration::minutes(config.retry_delay_minutes)).to_rfc3339())
    } else {
        None
    };
    db.execute(
        "
        UPDATE assistant_automation_runs
        SET status = 'failed',
            completed_at = ?2,
            error = ?3,
            next_retry_at = ?4,
            updated_at = ?2
        WHERE id = ?1
        ",
        rusqlite::params![run_id, now.to_rfc3339(), error, next_retry_at],
    )?;
    Ok(())
}

fn scheduled_time_for_today(local_time: &str) -> Option<DateTime<Local>> {
    let time = NaiveTime::parse_from_str(local_time, "%H:%M")
        .ok()
        .or_else(|| NaiveTime::parse_from_str(DEFAULT_AUTOMATION_LOCAL_TIME, "%H:%M").ok())?;
    let today = Local::now().date_naive();
    let scheduled = today.and_time(time);
    Local.from_local_datetime(&scheduled).earliest()
}

fn lock_db(
    handle: &AssistantAutomationHandle,
) -> Result<MutexGuard<'_, rusqlite::Connection>, AppError> {
    handle
        .db
        .lock()
        .map_err(|_| AppError::Runtime("automation database lock poisoned".to_string()))
}

fn map_runtime_state_error(error: RuntimeStateError) -> AppError {
    error.into()
}

trait OptionalRow<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalRow<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error),
        }
    }
}
