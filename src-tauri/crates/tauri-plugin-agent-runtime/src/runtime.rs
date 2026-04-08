use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use agent_core::{AgentError, RuntimeContext, ToolContext};
use codex_app_server_client::{
    InProcessAppServerClient, InProcessAppServerRequestHandle, InProcessClientStartArgs,
    InProcessServerEvent, TypedRequestError, DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
};
use codex_app_server_protocol::{
    ClientRequest, CodexErrorInfo, ConfigWarningNotification, DynamicToolCallOutputContentItem,
    DynamicToolCallParams, DynamicToolCallResponse, DynamicToolSpec, ItemCompletedNotification,
    ItemStartedNotification, JSONRPCErrorError, ReasoningSummaryTextDeltaNotification,
    ReasoningTextDeltaNotification, RequestId, ServerNotification, ServerRequest, ThreadItem,
    ThreadStartParams, ThreadStartResponse, TurnCompletedNotification, TurnInterruptParams,
    TurnInterruptResponse, TurnStartParams, TurnStartResponse, TurnStartedNotification, TurnStatus,
    UserInput,
};
use codex_arg0::Arg0DispatchPaths;
use codex_core::config::ConfigBuilder;
use codex_core::config_loader::{CloudRequirementsLoader, LoaderOverrides};
use codex_feedback::CodexFeedback;
use codex_protocol::protocol::SessionSource;
use clotho_adapter::image::stored_task_image_path;
use clotho_adapter::ImageRepository;
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::db;
use crate::error::{Error, Result};
use crate::events;
use crate::models::AttachmentRef;
use crate::native_tools;
use crate::proposal;
use crate::session::{AssistantRuntimeState, StreamDispatch};

#[derive(Clone, Default)]
pub struct EmbeddedCodexRuntime {
    inner: Arc<Mutex<EmbeddedCodexRuntimeInner>>,
}

#[derive(Default)]
struct EmbeddedCodexRuntimeInner {
    request_handle: Option<InProcessAppServerRequestHandle>,
    resolution_tx: Option<mpsc::UnboundedSender<RuntimeBridgeCommand>>,
}

struct RuntimeBridgeCommand {
    request_id: RequestId,
    response: Value,
    completion: oneshot::Sender<Result<()>>,
}

static NEXT_REQUEST_ID: AtomicI64 = AtomicI64::new(1);

pub async fn start_runtime_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    local_thread_id: String,
    local_turn_id: String,
    text: String,
    attachments: Vec<AttachmentRef>,
    mode: String,
    model_override: Option<String>,
    config_context: Option<crate::models::ConfigSelection>,
) -> Result<()> {
    let request_handle = state
        .runtime()
        .ensure_started(app.clone(), state.clone())
        .await?;
    let structured_proposal = proposal::should_request_structured_proposal(&text, &mode);

    if !mode.eq_ignore_ascii_case("access") {
        events::emit_debug(
            &app,
            format!("turn `{local_turn_id}` started in mode `{mode}`; current runtime bridge keeps mode as prompt-side context only."),
        );
    }

    let runtime_thread_id = ensure_runtime_thread(
        &request_handle,
        &state,
        &local_thread_id,
        config_context.as_ref(),
    )
    .await?;

    let inputs = build_user_inputs(
        &app,
        text,
        attachments,
        structured_proposal.then_some(proposal::proposal_output_instruction()),
    )?;
    let response: TurnStartResponse = request_handle
        .request_typed(ClientRequest::TurnStart {
            request_id: next_request_id(),
            params: TurnStartParams {
                thread_id: runtime_thread_id.clone(),
                input: inputs,
                model: model_override.clone(),
                output_schema: structured_proposal.then(proposal::proposal_output_schema),
                ..Default::default()
            },
        })
        .await
        .map_err(request_error)?;

    state.bind_runtime_turn(&local_thread_id, &local_turn_id, &response.turn.id)?;
    Ok(())
}

pub async fn interrupt_runtime_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
) -> Result<bool> {
    let Some(binding) = state.runtime_turn_binding(&thread_id, &turn_id)? else {
        events::emit_debug(
            &app,
            format!(
                "cancel ignored for turn `{turn_id}` because runtime turn binding is not ready"
            ),
        );
        return Ok(false);
    };

    let request_handle = state
        .runtime()
        .ensure_started(app.clone(), state.clone())
        .await?;
    let _: TurnInterruptResponse = request_handle
        .request_typed(ClientRequest::TurnInterrupt {
            request_id: next_request_id(),
            params: TurnInterruptParams {
                thread_id: binding.runtime_thread_id,
                turn_id: binding.runtime_turn_id,
            },
        })
        .await
        .map_err(request_error)?;
    Ok(true)
}

pub async fn submit_runtime_request_response<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
    request_id: String,
    response: Value,
) -> Result<String> {
    let request = state.pending_request_handle(&thread_id, &turn_id, &request_id)?;
    let resolution_tx = state
        .runtime()
        .current_resolution_tx()
        .await
        .ok_or_else(|| Error::Runtime("embedded Codex runtime is not running".to_string()))?;
    let (completion_tx, completion_rx) = oneshot::channel();
    resolution_tx
        .send(RuntimeBridgeCommand {
            request_id: request.request_id,
            response: response.clone(),
            completion: completion_tx,
        })
        .map_err(|_| {
            Error::Runtime("embedded Codex runtime resolution channel is closed".to_string())
        })?;
    completion_rx
        .await
        .map_err(|_| {
            Error::Runtime("embedded Codex runtime resolution ack channel is closed".to_string())
        })??;

    let request_kind = request.request_kind.clone();
    state.remove_pending_runtime_request(&thread_id, &turn_id, &request_id)?;
    dispatch(
        &app,
        &state,
        &thread_id,
        &turn_id,
        "runtime_request_resolved",
        json!({
            "requestId": request_id,
            "requestKind": request_kind,
            "response": response,
        }),
    )?;

    Ok(request.request_kind)
}

impl EmbeddedCodexRuntime {
    pub async fn ensure_started<R: Runtime>(
        &self,
        app: AppHandle<R>,
        state: AssistantRuntimeState,
    ) -> Result<InProcessAppServerRequestHandle> {
        let mut inner = self.inner.lock().await;
        if let Some(handle) = inner.request_handle.clone() {
            return Ok(handle);
        }

        let (start_args, model, provider) = build_start_args().await?;
        let client = InProcessAppServerClient::start(start_args)
            .await
            .map_err(|err| {
                Error::Runtime(format!("failed to start embedded codex runtime: {err}"))
            })?;
        let request_handle = client.request_handle();
        let (resolution_tx, resolution_rx) = mpsc::unbounded_channel();
        inner.request_handle = Some(request_handle.clone());
        inner.resolution_tx = Some(resolution_tx);
        drop(inner);

        events::emit_status(&app, "connected");
        events::emit_debug(
            &app,
            format!(
                "embedded Codex runtime started. model={}, provider={}",
                display_or_default(model),
                provider
            ),
        );

        tauri::async_runtime::spawn(run_event_loop(
            app,
            state,
            self.clone(),
            client,
            resolution_rx,
        ));
        Ok(request_handle)
    }

    async fn mark_disconnected(&self) {
        let mut inner = self.inner.lock().await;
        inner.request_handle = None;
        inner.resolution_tx = None;
    }

    async fn current_resolution_tx(
        &self,
    ) -> Option<mpsc::UnboundedSender<RuntimeBridgeCommand>> {
        let inner = self.inner.lock().await;
        inner.resolution_tx.clone()
    }
}

async fn build_start_args() -> Result<(InProcessClientStartArgs, Option<String>, String)> {
    let cwd = std::env::current_dir()?;
    let config = ConfigBuilder::default()
        .fallback_cwd(Some(cwd))
        .build()
        .await?;

    let model = config.model.clone();
    let provider = config.model_provider_id.clone();
    let config_warnings = config
        .startup_warnings
        .iter()
        .map(|warning| ConfigWarningNotification {
            summary: warning.clone(),
            details: None,
            path: None,
            range: None,
        })
        .collect::<Vec<_>>();

    Ok((
        InProcessClientStartArgs {
            arg0_paths: Arg0DispatchPaths::default(),
            config: Arc::new(config),
            cli_overrides: Vec::new(),
            loader_overrides: LoaderOverrides::default(),
            cloud_requirements: CloudRequirementsLoader::default(),
            feedback: CodexFeedback::new(),
            config_warnings,
            session_source: SessionSource::Custom("clotho".to_string()),
            enable_codex_api_key_env: true,
            client_name: "clotho-assistant".to_string(),
            client_version: env!("CARGO_PKG_VERSION").to_string(),
            experimental_api: true,
            opt_out_notification_methods: Vec::new(),
            channel_capacity: DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
        },
        model,
        provider,
    ))
}

async fn ensure_runtime_thread(
    request_handle: &InProcessAppServerRequestHandle,
    state: &AssistantRuntimeState,
    local_thread_id: &str,
    config_context: Option<&crate::models::ConfigSelection>,
) -> Result<String> {
    if let Some(runtime_thread_id) = state.runtime_thread_id(local_thread_id)? {
        return Ok(runtime_thread_id);
    }

    let request_overrides = state.request_overrides(config_context)?;
    let dynamic_tools = dynamic_tool_specs(state).await;

    let response: ThreadStartResponse = request_handle
        .request_typed(ClientRequest::ThreadStart {
            request_id: next_request_id(),
            params: ThreadStartParams {
                cwd: Some(current_dir_string()?),
                config: Some(request_overrides),
                dynamic_tools: (!dynamic_tools.is_empty()).then_some(dynamic_tools),
                ..Default::default()
            },
        })
        .await
        .map_err(request_error)?;

    state.bind_runtime_thread(local_thread_id, &response.thread.id)?;
    Ok(response.thread.id)
}

async fn run_event_loop<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    runtime: EmbeddedCodexRuntime,
    mut client: InProcessAppServerClient,
    mut resolution_rx: mpsc::UnboundedReceiver<RuntimeBridgeCommand>,
) {
    loop {
        tokio::select! {
            Some(command) = resolution_rx.recv() => {
                let result = client
                    .resolve_server_request(command.request_id, command.response)
                    .await
                    .map_err(|err| Error::Runtime(format!("failed to resolve runtime request: {err}")));
                let _ = command.completion.send(result);
            }
            event = client.next_event() => {
                match event {
                    Some(InProcessServerEvent::Lagged { skipped }) => {
                        events::emit_debug(
                            &app,
                            format!(
                                "assistant runtime stream lagged; skipped {} low-priority events",
                                skipped
                            ),
                        );
                    }
                    Some(InProcessServerEvent::ServerNotification(notification)) => {
                        if let Err(err) = handle_server_notification(&app, &state, notification).await {
                            events::emit_debug(
                                &app,
                                format!("failed to process server notification: {err}"),
                            );
                        }
                    }
                    Some(InProcessServerEvent::ServerRequest(request)) => {
                        if let Err(err) = handle_server_request(&app, &state, &client, request).await {
                            events::emit_debug(&app, format!("failed to process server request: {err}"));
                        }
                    }
                    None => break,
                }
            }
        }
    }

    runtime.mark_disconnected().await;
    events::emit_status(&app, "disconnected");
}

async fn handle_server_request<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    client: &InProcessAppServerClient,
    request: ServerRequest,
) -> Result<()> {
    match request {
        ServerRequest::DynamicToolCall { request_id, params } => {
            let response = execute_dynamic_tool(app, state, &params).await;
            let result = serde_json::to_value(response)?;
            client
                .resolve_server_request(request_id, result)
                .await
                .map_err(|err| {
                    Error::Runtime(format!("failed to resolve dynamic tool call: {err}"))
                })?;
        }
        ServerRequest::CommandExecutionRequestApproval { request_id, params } => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&params.thread_id, &params.turn_id)
            {
                enqueue_runtime_request(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    request_id,
                    "command_execution_request_approval",
                    Some(params.item_id.clone()),
                    params.approval_id.clone(),
                    Some("命令执行审批".to_string()),
                    summarize_command_execution_request(&params),
                    serde_json::to_value(&params)?,
                )?;
            } else {
                reject_unroutable_request(
                    client,
                    request_id,
                    "command_execution_request_approval",
                )
                .await?;
            }
        }
        ServerRequest::FileChangeRequestApproval { request_id, params } => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&params.thread_id, &params.turn_id)
            {
                enqueue_runtime_request(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    request_id,
                    "file_change_request_approval",
                    Some(params.item_id.clone()),
                    None,
                    Some("文件变更审批".to_string()),
                    summarize_file_change_request(&params),
                    serde_json::to_value(&params)?,
                )?;
            } else {
                reject_unroutable_request(
                    client,
                    request_id,
                    "file_change_request_approval",
                )
                .await?;
            }
        }
        ServerRequest::PermissionsRequestApproval { request_id, params } => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&params.thread_id, &params.turn_id)
            {
                enqueue_runtime_request(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    request_id,
                    "permissions_request_approval",
                    Some(params.item_id.clone()),
                    None,
                    Some("权限审批".to_string()),
                    summarize_permissions_request(&params),
                    serde_json::to_value(&params)?,
                )?;
            } else {
                reject_unroutable_request(
                    client,
                    request_id,
                    "permissions_request_approval",
                )
                .await?;
            }
        }
        ServerRequest::ToolRequestUserInput { request_id, params } => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&params.thread_id, &params.turn_id)
            {
                enqueue_runtime_request(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    request_id,
                    "tool_request_user_input",
                    Some(params.item_id.clone()),
                    None,
                    Some("需要补充信息".to_string()),
                    summarize_tool_user_input_request(&params),
                    serde_json::to_value(&params)?,
                )?;
            } else {
                reject_unroutable_request(
                    client,
                    request_id,
                    "tool_request_user_input",
                )
                .await?;
            }
        }
        ServerRequest::McpServerElicitationRequest { request_id, params } => {
            let local = params
                .turn_id
                .as_deref()
                .and_then(|turn_id| state.resolve_local_turn_for_runtime(&params.thread_id, turn_id))
                .or_else(|| state.resolve_local_turn_for_runtime_thread(&params.thread_id));
            if let Some((local_thread_id, local_turn_id)) = local {
                enqueue_runtime_request(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    request_id,
                    "mcp_server_elicitation_request",
                    None,
                    None,
                    Some("MCP 需要补充信息".to_string()),
                    summarize_mcp_elicitation_request(&params),
                    serde_json::to_value(&params)?,
                )?;
            } else {
                reject_unroutable_request(
                    client,
                    request_id,
                    "mcp_server_elicitation_request",
                )
                .await?;
            }
        }
        ServerRequest::ApplyPatchApproval { request_id, params } => {
            let runtime_thread_id = params.conversation_id.to_string();
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime_thread(&runtime_thread_id)
            {
                enqueue_runtime_request(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    request_id,
                    "apply_patch_approval",
                    Some(params.call_id.clone()),
                    None,
                    Some("补丁审批".to_string()),
                    Some(format!("{} file change(s)", params.file_changes.len())),
                    serde_json::to_value(&params)?,
                )?;
            } else {
                reject_unroutable_request(client, request_id, "apply_patch_approval").await?;
            }
        }
        ServerRequest::ExecCommandApproval { request_id, params } => {
            let runtime_thread_id = params.conversation_id.to_string();
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime_thread(&runtime_thread_id)
            {
                enqueue_runtime_request(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    request_id,
                    "exec_command_approval",
                    Some(params.call_id.clone()),
                    params.approval_id.clone(),
                    Some("命令执行审批".to_string()),
                    Some(params.command.join(" ")),
                    serde_json::to_value(&params)?,
                )?;
            } else {
                reject_unroutable_request(client, request_id, "exec_command_approval").await?;
            }
        }
        other => {
            client
                .reject_server_request(
                    other.id().clone(),
                    JSONRPCErrorError {
                        code: -32000,
                        message: format!(
                            "unsupported app-server request in Phase 1/2 bridge: {}",
                            server_request_name(&other)
                        ),
                        data: None,
                    },
                )
                .await
                .map_err(|err| Error::Runtime(format!("failed to reject server request: {err}")))?;
        }
    }
    Ok(())
}

async fn dynamic_tool_specs(state: &AssistantRuntimeState) -> Vec<DynamicToolSpec> {
    let mut specs = Vec::new();

    if state.include_builtin_native_tools() {
        specs.extend(native_tools::specs());
    }

    if let Some(agent_runtime) = state.agent_runtime() {
        let runtime_ctx = RuntimeContext {
            agent_id: None,
            permission: agent_runtime.config().default_permission.clone(),
        };
        for tool in agent_runtime.list_dynamic_tools(&runtime_ctx).await {
            if specs.iter().any(|existing| existing.name == tool.id) {
                continue;
            }
            specs.push(function_tool_to_dynamic_spec(tool));
        }
    }

    specs
}

async fn execute_dynamic_tool<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    params: &DynamicToolCallParams,
) -> DynamicToolCallResponse {
    if let Some(agent_runtime) = state.agent_runtime() {
        let local_turn = state.resolve_local_turn_for_runtime(&params.thread_id, &params.turn_id);
        let permission = agent_runtime.config().default_permission.clone();
        let tool_ctx = ToolContext {
            agent_id: None,
            thread_id: local_turn.as_ref().map(|(thread_id, _)| thread_id.clone()),
            turn_id: local_turn.as_ref().map(|(_, turn_id)| turn_id.clone()),
            permission,
        };

        match agent_runtime
            .invoke_tool(&tool_ctx, &params.tool, params.arguments.clone())
            .await
        {
            Ok(value) => return dynamic_tool_response(value, true),
            Err(AgentError::MissingRegistration(_)) => {}
            Err(err) => {
                return dynamic_tool_response(
                    json!({
                        "error": err.to_string(),
                        "tool": params.tool,
                    }),
                    false,
                );
            }
        }
    }

    if state.include_builtin_native_tools() {
        native_tools::execute(app, state, params)
    } else {
        dynamic_tool_response(
            json!({
                "error": format!("unknown dynamic tool `{}`", params.tool),
                "tool": params.tool,
            }),
            false,
        )
    }
}

fn function_tool_to_dynamic_spec(tool: agent_core::FunctionToolDefinition) -> DynamicToolSpec {
    DynamicToolSpec {
        name: tool.id,
        description: tool.description,
        input_schema: tool
            .input_schema
            .unwrap_or_else(|| json!({"type": "object", "additionalProperties": true})),
        defer_loading: false,
    }
}

fn dynamic_tool_response(value: Value, success: bool) -> DynamicToolCallResponse {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
    DynamicToolCallResponse {
        content_items: vec![DynamicToolCallOutputContentItem::InputText { text }],
        success,
    }
}

async fn handle_server_notification<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    notification: ServerNotification,
) -> Result<()> {
    match notification {
        ServerNotification::TurnStarted(TurnStartedNotification { thread_id, turn }) => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&thread_id, &turn.id)
            {
                dispatch(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    "turn_started",
                    json!({
                        "runtimeThreadId": thread_id,
                        "runtimeTurnId": turn.id,
                        "title": state.thread_title(&local_thread_id),
                    }),
                )?;
            }
        }
        ServerNotification::ReasoningTextDelta(ReasoningTextDeltaNotification {
            thread_id,
            turn_id,
            item_id,
            delta,
            ..
        }) => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&thread_id, &turn_id)
            {
                ensure_reasoning_started(app, state, &local_thread_id, &local_turn_id, &item_id)?;
                dispatch(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    "reasoning_delta",
                    json!({
                        "blockId": item_id,
                        "textDelta": delta,
                    }),
                )?;
            }
        }
        ServerNotification::ReasoningSummaryTextDelta(ReasoningSummaryTextDeltaNotification {
            thread_id,
            turn_id,
            item_id,
            delta,
            ..
        }) => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&thread_id, &turn_id)
            {
                ensure_reasoning_started(app, state, &local_thread_id, &local_turn_id, &item_id)?;
                dispatch(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    "reasoning_delta",
                    json!({
                        "blockId": item_id,
                        "textDelta": delta,
                    }),
                )?;
            }
        }
        ServerNotification::AgentMessageDelta(delta) => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&delta.thread_id, &delta.turn_id)
            {
                dispatch(
                    app,
                    state,
                    &local_thread_id,
                    &local_turn_id,
                    "assistant_message_delta",
                    json!({
                        "messageId": delta.item_id,
                        "textDelta": delta.delta,
                    }),
                )?;
            }
        }
        ServerNotification::ItemStarted(ItemStartedNotification {
            thread_id,
            turn_id,
            item,
        }) => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&thread_id, &turn_id)
            {
                if let Some(reasoning_id) = reasoning_item_id(&item) {
                    ensure_reasoning_started(
                        app,
                        state,
                        &local_thread_id,
                        &local_turn_id,
                        &reasoning_id,
                    )?;
                } else if let Some(payload) = tool_start_payload(&item) {
                    dispatch(
                        app,
                        state,
                        &local_thread_id,
                        &local_turn_id,
                        "tool_call_started",
                        payload,
                    )?;
                }
            }
        }
        ServerNotification::ItemCompleted(ItemCompletedNotification {
            thread_id,
            turn_id,
            item,
        }) => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&thread_id, &turn_id)
            {
                if let Some(reasoning_id) = reasoning_item_id(&item) {
                    dispatch(
                        app,
                        state,
                        &local_thread_id,
                        &local_turn_id,
                        "reasoning_completed",
                        json!({ "blockId": reasoning_id }),
                    )?;
                } else if let Some(payload) = tool_finished_payload(&item) {
                    dispatch(
                        app,
                        state,
                        &local_thread_id,
                        &local_turn_id,
                        "tool_call_finished",
                        payload,
                    )?;
                }
            }
        }
        ServerNotification::TurnCompleted(TurnCompletedNotification { thread_id, turn }) => {
            if let Some((local_thread_id, local_turn_id)) =
                state.resolve_local_turn_for_runtime(&thread_id, &turn.id)
            {
                if let Ok(Some((message_id, text))) =
                    state.latest_assistant_message_for_turn(&local_thread_id, &local_turn_id)
                {
                    if let Some(extracted) = proposal::extract_proposal_from_structured_output(
                        &message_id,
                        &text,
                        &local_thread_id,
                        &local_turn_id,
                    )
                    .or_else(|| {
                        proposal::extract_proposal_from_message(
                            &message_id,
                            &text,
                            &local_thread_id,
                            &local_turn_id,
                        )
                    }) {
                        dispatch(
                            app,
                            state,
                            &local_thread_id,
                            &local_turn_id,
                            "proposal_ready",
                            json!({
                                "proposalId": extracted.proposal.proposal_id,
                                "proposal": extracted.proposal,
                                "summary": extracted.proposal.summary,
                                "sourceMessageId": extracted.source_message_id,
                                "consumeSourceMessage": extracted.consume_source_message,
                            }),
                        )?;
                    }
                }
                let _ = state.clear_pending_requests_for_turn(&local_thread_id, &local_turn_id);
                match turn.status {
                    TurnStatus::Completed => {
                        dispatch(
                            app,
                            state,
                            &local_thread_id,
                            &local_turn_id,
                            "turn_completed",
                            json!({}),
                        )?;
                    }
                    TurnStatus::Interrupted => {
                        dispatch(
                            app,
                            state,
                            &local_thread_id,
                            &local_turn_id,
                            "turn_cancelled",
                            json!({}),
                        )?;
                    }
                    TurnStatus::Failed => {
                        let (code, message) = turn_error_payload(&turn);
                        dispatch(
                            app,
                            state,
                            &local_thread_id,
                            &local_turn_id,
                            "turn_failed",
                            json!({
                                "code": code,
                                "message": message,
                            }),
                        )?;
                    }
                    TurnStatus::InProgress => {}
                }
            }
        }
        _ => {}
    }

    Ok(())
}

fn build_user_inputs<R: Runtime>(
    app: &AppHandle<R>,
    text: String,
    attachments: Vec<AttachmentRef>,
    proposal_instruction: Option<&str>,
) -> Result<Vec<UserInput>> {
    let mut inputs = vec![UserInput::Text {
        text,
        text_elements: Vec::new(),
    }];

    if let Some(instruction) = proposal_instruction {
        inputs.push(UserInput::Text {
            text: instruction.to_string(),
            text_elements: Vec::new(),
        });
    }

    if attachments.is_empty() {
        return Ok(inputs);
    }

    let conn = db::open_connection(app)?;
    let app_data_dir = db::app_data_dir(app)?;

    for attachment in attachments {
        let kind = attachment
            .kind
            .as_deref()
            .or_else(|| attachment.path.as_deref().map(|_| "local_image"))
            .unwrap_or("task_image");

        match kind {
            "task_image" => {
                let attachment_id = attachment.id.as_deref().ok_or_else(|| {
                    Error::InvalidInput(
                        "task_image attachment must provide an id".to_string(),
                    )
                })?;
                let image = ImageRepository::get(&conn, attachment_id)
                    .map_err(domain_error_to_plugin)?;
                let image_path =
                    stored_task_image_path(&app_data_dir, &image.id, &image.filename);
                if !image_path.exists() {
                    return Err(Error::NotFound(format!(
                        "attachment file not found: {}",
                        image_path.display()
                    )));
                }
                inputs.push(UserInput::LocalImage { path: image_path });
            }
            "local_image" => {
                let path = attachment.path.ok_or_else(|| {
                    Error::InvalidInput(
                        "local_image attachment must provide a path".to_string(),
                    )
                })?;
                inputs.push(UserInput::LocalImage { path: path.into() });
            }
            other => {
                return Err(Error::InvalidInput(format!(
                    "unsupported attachment kind `{other}`"
                )));
            }
        }
    }

    Ok(inputs)
}

fn enqueue_runtime_request<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    local_thread_id: &str,
    local_turn_id: &str,
    request_handle: RequestId,
    request_kind: &str,
    item_id: Option<String>,
    approval_id: Option<String>,
    title: Option<String>,
    summary: Option<String>,
    payload: Value,
) -> Result<()> {
    let request_id = encode_request_id(&request_handle);
    let request = state.store_pending_runtime_request(
        local_thread_id,
        local_turn_id,
        request_id,
        request_handle,
        request_kind.to_string(),
        item_id,
        approval_id,
        title,
        summary,
        payload,
    )?;
    dispatch(
        app,
        state,
        local_thread_id,
        local_turn_id,
        "runtime_request_pending",
        serde_json::to_value(request)?,
    )
}

async fn reject_unroutable_request(
    client: &InProcessAppServerClient,
    request_id: RequestId,
    request_kind: &str,
) -> Result<()> {
    client
        .reject_server_request(
            request_id,
            JSONRPCErrorError {
                code: -32000,
                message: format!("failed to route runtime request: {request_kind}"),
                data: None,
            },
        )
        .await
        .map_err(|err| Error::Runtime(format!("failed to reject server request: {err}")))?;
    Ok(())
}

fn encode_request_id(request_id: &RequestId) -> String {
    match request_id {
        RequestId::Integer(value) => format!("i:{value}"),
        RequestId::String(value) => format!("s:{value}"),
    }
}

fn domain_error_to_plugin(error: clotho_adapter::DomainError) -> Error {
    match error {
        clotho_adapter::DomainError::Database(err) => Error::Sqlite(err),
        clotho_adapter::DomainError::NotFound(message) => Error::NotFound(message),
        clotho_adapter::DomainError::InvalidInput(message) => Error::InvalidInput(message),
        clotho_adapter::DomainError::Conflict(message) => Error::Conflict(message),
    }
}

fn summarize_command_execution_request(
    params: &codex_app_server_protocol::CommandExecutionRequestApprovalParams,
) -> Option<String> {
    params
        .command
        .clone()
        .or_else(|| params.reason.clone())
        .or_else(|| {
            params
                .cwd
                .as_ref()
                .map(|cwd| format!("working directory: {}", cwd.display()))
        })
}

fn summarize_file_change_request(
    params: &codex_app_server_protocol::FileChangeRequestApprovalParams,
) -> Option<String> {
    params.reason.clone().or_else(|| {
        params
            .grant_root
            .as_ref()
            .map(|path| format!("grant root: {}", path.display()))
    })
}

fn summarize_permissions_request(
    params: &codex_app_server_protocol::PermissionsRequestApprovalParams,
) -> Option<String> {
    params.reason.clone().or_else(|| {
        serde_json::to_string_pretty(&params.permissions).ok()
    })
}

fn summarize_tool_user_input_request(
    params: &codex_app_server_protocol::ToolRequestUserInputParams,
) -> Option<String> {
    params.questions.first().map(|question| question.question.clone())
}

fn summarize_mcp_elicitation_request(
    params: &codex_app_server_protocol::McpServerElicitationRequestParams,
) -> Option<String> {
    match &params.request {
        codex_app_server_protocol::McpServerElicitationRequest::Form { message, .. }
        | codex_app_server_protocol::McpServerElicitationRequest::Url { message, .. } => {
            Some(message.clone())
        }
    }
}

fn ensure_reasoning_started<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    local_thread_id: &str,
    local_turn_id: &str,
    block_id: &str,
) -> Result<()> {
    dispatch(
        app,
        state,
        local_thread_id,
        local_turn_id,
        "reasoning_started",
        json!({ "blockId": block_id }),
    )
}

fn dispatch<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
    local_thread_id: &str,
    local_turn_id: &str,
    kind: &str,
    payload: Value,
) -> Result<()> {
    let StreamDispatch { item, subscribers } =
        state.push_stream_event(local_thread_id, local_turn_id, "runtime", kind, payload)?;
    for subscriber in subscribers {
        let _ = subscriber.send(item.clone());
    }
    events::emit_threads_changed(app, "updated", Some(local_thread_id));
    Ok(())
}

fn reasoning_item_id(item: &ThreadItem) -> Option<String> {
    match item {
        ThreadItem::Reasoning { id, .. } => Some(id.clone()),
        _ => None,
    }
}

fn tool_start_payload(item: &ThreadItem) -> Option<Value> {
    match item {
        ThreadItem::DynamicToolCall {
            id,
            tool,
            arguments,
            ..
        } => Some(json!({
            "toolCallId": id,
            "toolName": tool,
            "status": "running",
            "summary": summarize_arguments(arguments),
            "arguments": arguments,
        })),
        ThreadItem::CommandExecution {
            id, command, cwd, ..
        } => Some(json!({
            "toolCallId": id,
            "toolName": "exec_command",
            "status": "running",
            "summary": format!("{} ({})", command, cwd.display()),
        })),
        ThreadItem::McpToolCall {
            id,
            server,
            tool,
            arguments,
            ..
        } => Some(json!({
            "toolCallId": id,
            "toolName": format!("mcp:{}:{}", server, tool),
            "status": "running",
            "summary": summarize_arguments(arguments),
            "arguments": arguments,
        })),
        ThreadItem::WebSearch { id, query, .. } => Some(json!({
            "toolCallId": id,
            "toolName": "web_search",
            "status": "running",
            "summary": query,
        })),
        ThreadItem::FileChange { id, changes, .. } => Some(json!({
            "toolCallId": id,
            "toolName": "apply_patch",
            "status": "running",
            "summary": format!("{} file change(s)", changes.len()),
        })),
        _ => None,
    }
}

fn tool_finished_payload(item: &ThreadItem) -> Option<Value> {
    match item {
        ThreadItem::DynamicToolCall {
            id,
            tool,
            status,
            content_items,
            success,
            ..
        } => Some(json!({
            "toolCallId": id,
            "toolName": tool,
            "status": dynamic_status_name(status),
            "summary": summarize_dynamic_output(content_items.as_ref(), success.unwrap_or(false)),
            "success": success,
            "contentItems": content_items,
        })),
        ThreadItem::CommandExecution {
            id,
            command,
            cwd,
            status,
            aggregated_output,
            exit_code,
            ..
        } => Some(json!({
            "toolCallId": id,
            "toolName": "exec_command",
            "status": command_status_name(status),
            "summary": aggregated_output.clone().unwrap_or_else(|| format!("{} (exit={:?})", command, exit_code)),
            "command": command,
            "cwd": cwd,
            "aggregatedOutput": aggregated_output,
            "exitCode": exit_code,
        })),
        ThreadItem::McpToolCall {
            id,
            server,
            tool,
            arguments,
            status,
            result,
            error,
            ..
        } => Some(json!({
            "toolCallId": id,
            "toolName": format!("mcp:{}:{}", server, tool),
            "status": mcp_status_name(status),
            "summary": result
                .as_ref()
                .map(summarize_mcp_result)
                .or_else(|| error.as_ref().map(summarize_mcp_error))
                .unwrap_or_else(|| "mcp tool call completed".to_string()),
            "arguments": arguments,
            "result": result,
            "error": error,
        })),
        ThreadItem::WebSearch { id, query, action } => Some(json!({
            "toolCallId": id,
            "toolName": "web_search",
            "status": "completed",
            "summary": format!("query={}, action={}", query, summarize_json_value(&serde_json::to_value(action).unwrap_or(Value::Null))),
            "query": query,
            "action": action,
        })),
        ThreadItem::FileChange {
            id,
            changes,
            status,
        } => Some(json!({
            "toolCallId": id,
            "toolName": "apply_patch",
            "status": format!("{:?}", status).to_lowercase(),
            "summary": format!("{} file change(s)", changes.len()),
            "changes": changes,
        })),
        _ => None,
    }
}

fn turn_error_payload(turn: &codex_app_server_protocol::Turn) -> (String, String) {
    let Some(error) = turn.error.as_ref() else {
        return (
            "runtime_error".to_string(),
            "assistant turn failed".to_string(),
        );
    };
    let code = error
        .codex_error_info
        .as_ref()
        .map(codex_error_code)
        .map(str::to_string)
        .unwrap_or_else(|| "runtime_error".to_string());
    let message = error
        .additional_details
        .clone()
        .unwrap_or_else(|| error.message.clone());
    (code, message)
}

fn summarize_arguments(arguments: &Value) -> String {
    summarize_json_value(arguments)
}

fn summarize_dynamic_output(
    content_items: Option<&Vec<DynamicToolCallOutputContentItem>>,
    success: bool,
) -> String {
    let Some(content_items) = content_items else {
        return if success {
            "tool call completed".to_string()
        } else {
            "tool call failed".to_string()
        };
    };

    let parts = content_items
        .iter()
        .map(|item| match item {
            DynamicToolCallOutputContentItem::InputText { text } => text.clone(),
            DynamicToolCallOutputContentItem::InputImage { image_url } => image_url.clone(),
        })
        .collect::<Vec<_>>();
    parts.join("\n")
}

fn summarize_json_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::String(text) => text.clone(),
        _ => serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()),
    }
}

fn summarize_mcp_result(result: &codex_app_server_protocol::McpToolCallResult) -> String {
    result
        .structured_content
        .as_ref()
        .map(summarize_json_value)
        .or_else(|| {
            (!result.content.is_empty())
                .then(|| summarize_json_value(&Value::Array(result.content.clone())))
        })
        .unwrap_or_else(|| "mcp tool call completed".to_string())
}

fn summarize_mcp_error(error: &codex_app_server_protocol::McpToolCallError) -> String {
    error.message.clone()
}

fn dynamic_status_name(status: &codex_app_server_protocol::DynamicToolCallStatus) -> &'static str {
    match status {
        codex_app_server_protocol::DynamicToolCallStatus::InProgress => "running",
        codex_app_server_protocol::DynamicToolCallStatus::Completed => "completed",
        codex_app_server_protocol::DynamicToolCallStatus::Failed => "failed",
    }
}

fn command_status_name(status: &codex_app_server_protocol::CommandExecutionStatus) -> &'static str {
    match status {
        codex_app_server_protocol::CommandExecutionStatus::InProgress => "running",
        codex_app_server_protocol::CommandExecutionStatus::Completed => "completed",
        codex_app_server_protocol::CommandExecutionStatus::Failed => "failed",
        codex_app_server_protocol::CommandExecutionStatus::Declined => "declined",
    }
}

fn mcp_status_name(status: &codex_app_server_protocol::McpToolCallStatus) -> &'static str {
    match status {
        codex_app_server_protocol::McpToolCallStatus::InProgress => "running",
        codex_app_server_protocol::McpToolCallStatus::Completed => "completed",
        codex_app_server_protocol::McpToolCallStatus::Failed => "failed",
    }
}

fn codex_error_code(info: &CodexErrorInfo) -> &'static str {
    match info {
        CodexErrorInfo::ContextWindowExceeded => "context_window_exceeded",
        CodexErrorInfo::UsageLimitExceeded => "usage_limit_exceeded",
        CodexErrorInfo::ServerOverloaded => "server_overloaded",
        CodexErrorInfo::HttpConnectionFailed { .. } => "http_connection_failed",
        CodexErrorInfo::ResponseStreamConnectionFailed { .. } => {
            "response_stream_connection_failed"
        }
        CodexErrorInfo::InternalServerError => "internal_server_error",
        CodexErrorInfo::Unauthorized => "unauthorized",
        CodexErrorInfo::BadRequest => "bad_request",
        CodexErrorInfo::ThreadRollbackFailed => "thread_rollback_failed",
        CodexErrorInfo::SandboxError => "sandbox_error",
        CodexErrorInfo::ResponseStreamDisconnected { .. } => "response_stream_disconnected",
        CodexErrorInfo::ResponseTooManyFailedAttempts { .. } => "response_too_many_failed_attempts",
        CodexErrorInfo::ActiveTurnNotSteerable { .. } => "active_turn_not_steerable",
        CodexErrorInfo::Other => "other",
    }
}

fn next_request_id() -> RequestId {
    RequestId::Integer(NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed))
}

fn server_request_name(request: &ServerRequest) -> &'static str {
    match request {
        ServerRequest::CommandExecutionRequestApproval { .. } => {
            "command_execution_request_approval"
        }
        ServerRequest::FileChangeRequestApproval { .. } => "file_change_request_approval",
        ServerRequest::ToolRequestUserInput { .. } => "tool_request_user_input",
        ServerRequest::McpServerElicitationRequest { .. } => "mcp_server_elicitation_request",
        ServerRequest::PermissionsRequestApproval { .. } => "permissions_request_approval",
        ServerRequest::DynamicToolCall { .. } => "dynamic_tool_call",
        ServerRequest::ChatgptAuthTokensRefresh { .. } => "chatgpt_auth_tokens_refresh",
        ServerRequest::ApplyPatchApproval { .. } => "apply_patch_approval",
        ServerRequest::ExecCommandApproval { .. } => "exec_command_approval",
    }
}

fn request_error(error: TypedRequestError) -> Error {
    Error::Runtime(error.to_string())
}

fn current_dir_string() -> Result<String> {
    Ok(std::env::current_dir()?.to_string_lossy().into_owned())
}

fn display_or_default(value: Option<String>) -> String {
    value.unwrap_or_else(|| "<default>".to_string())
}
