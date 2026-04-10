import { Channel, invoke, type InvokeArgs } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ApplyProposalAck,
  ApplyProposalRequest,
  AssistantDebugPayload,
  AssistantStatusEventEnvelope,
  AssistantThreadsChangedPayload,
  AssistantTurnStreamEnvelope,
  CancelTurnAck,
  CancelTurnRequest,
  CreateThreadRequest,
  CreateThreadResponse,
  DailyAutomationRunNowAck,
  DailyAutomationStatus,
  ListThreadsResponse,
  ProposalSimulationReport,
  ResolveConfigProfileRequest,
  ResolvedConfig,
  ResumeTurnStreamAck,
  ResumeTurnStreamRequest,
  RuntimeCatalog,
  StageLocalImageRequest,
  StageLocalImageResponse,
  StartTurnAck,
  StartTurnRequest,
  SubmitRuntimeRequestAck,
  SubmitRuntimeRequestRequest,
  ThreadSnapshot,
} from '@/types/assistant-runtime';

const DEFAULT_PLUGIN = 'agent-runtime' as const;
const DEFAULT_STATUS_EVENT = 'agent-runtime://status' as const;
const DEFAULT_THREADS_CHANGED_EVENT = 'agent-runtime://threads-changed' as const;
const DEFAULT_DEBUG_EVENT = 'agent-runtime://debug' as const;

function toPluginConfigContext(configContext: CreateThreadRequest['configContext']) {
  if (!configContext?.configFilePath) {
    return null;
  }
  return {
    configId: configContext.configFilePath,
    profile: configContext.profile ?? null,
  };
}

function fromResolvedConfig(config: {
  configId: string;
  configFilePath?: string | null;
  profile?: string | null;
  model: string;
  provider: string;
  baseUrl?: string | null;
  envKey?: string | null;
  wireApi: string;
  approvalPolicy?: string | null;
  sandboxMode?: string | null;
  reasoningEffort?: string | null;
  reasoningSummary?: string | null;
  verbosity?: string | null;
  personality?: string | null;
  serviceTier?: string | null;
  providerConfig?: Record<string, unknown> | null;
}): ResolvedConfig {
  return {
    configFilePath: config.configFilePath ?? config.configId,
    profile: config.profile ?? null,
    model: config.model,
    provider: config.provider,
    baseUrl: config.baseUrl ?? null,
    envKey: config.envKey ?? null,
    wireApi: config.wireApi,
    approvalPolicy: config.approvalPolicy ?? null,
    sandboxMode: config.sandboxMode ?? null,
    reasoningEffort: config.reasoningEffort ?? null,
    reasoningSummary: config.reasoningSummary ?? null,
    verbosity: config.verbosity ?? null,
    personality: config.personality ?? null,
    serviceTier: config.serviceTier ?? null,
    providerConfig: config.providerConfig ?? null,
  };
}

function normalizeActiveTurn(
  activeTurn: ThreadSnapshot['activeTurn'],
): ThreadSnapshot['activeTurn'] {
  if (!activeTurn) {
    return null;
  }
  return {
    ...activeTurn,
    agentId: activeTurn.agentId ?? null,
    requestedAgentId: activeTurn.requestedAgentId ?? null,
    collaborationMode: activeTurn.collaborationMode ?? 'default',
    routingSource: activeTurn.routingSource ?? 'direct',
  };
}

class AssistantRuntimeClient {
  constructor(
    private readonly plugin = DEFAULT_PLUGIN,
    private readonly statusEvent = DEFAULT_STATUS_EVENT,
    private readonly threadsChangedEvent = DEFAULT_THREADS_CHANGED_EVENT,
    private readonly debugEvent = DEFAULT_DEBUG_EVENT,
  ) {}

  private pluginCommand<T>(name: string, args?: InvokeArgs) {
    return invoke<T>(`plugin:${this.plugin}|${name}`, args);
  }

  private appCommand<T>(name: string, args?: InvokeArgs) {
    return invoke<T>(name, args);
  }

  listThreads(req?: { limit?: number; cursor?: string | null }) {
    return this.pluginCommand<ListThreadsResponse>('list_threads', req ? { ...req } : undefined);
  }

  async getThreadSnapshot(threadId: string) {
    const snapshot = await this.pluginCommand<any>('get_thread_snapshot', { threadId });
    return {
      ...snapshot,
      activeTurn: normalizeActiveTurn(snapshot.activeTurn),
      configContext: snapshot.configContext ? fromResolvedConfig(snapshot.configContext) : null,
    };
  }

  createThread(req?: CreateThreadRequest) {
    return this.pluginCommand<CreateThreadResponse>(
      'create_thread',
      req
        ? {
            title: req.title ?? null,
            configContext: toPluginConfigContext(req.configContext),
          }
        : undefined,
    );
  }

  async startTurn(req: StartTurnRequest, onItem: (item: AssistantTurnStreamEnvelope) => void) {
    const onEvent = new Channel<AssistantTurnStreamEnvelope>(onItem);
    const text = await this.appCommand<string>('assistant_prepare_turn_text', {
      threadId: req.threadId,
      text: req.text,
      mode: req.mode,
    });
    return this.pluginCommand<StartTurnAck>('start_turn', {
      threadId: req.threadId,
      text,
      mode: req.mode,
      attachments: req.attachments,
      modelOverride: req.modelOverride ?? null,
      configContext: toPluginConfigContext(req.configContext),
      onEvent,
    });
  }

  resumeTurnStream(
    req: ResumeTurnStreamRequest,
    onItem: (item: AssistantTurnStreamEnvelope) => void,
  ) {
    const onEvent = new Channel<AssistantTurnStreamEnvelope>(onItem);
    return this.pluginCommand<ResumeTurnStreamAck>('resume_turn_stream', { ...req, onEvent });
  }

  cancelTurn(req: CancelTurnRequest) {
    return this.pluginCommand<CancelTurnAck>('cancel_turn', { ...req });
  }

  submitRuntimeRequest(req: SubmitRuntimeRequestRequest) {
    return this.pluginCommand<SubmitRuntimeRequestAck>('submit_runtime_request', { ...req });
  }

  listConfigFiles() {
    return this.pluginCommand<{ items: Array<{ configId: string; configFilePath?: string | null; source: string; exists: boolean; isDefault: boolean }> }>('list_configs').then((response) => ({
      items: response.items.map((item) => ({
        path: item.configFilePath ?? item.configId,
        source: item.source,
        exists: item.exists,
        isDefault: item.isDefault,
      })),
    }));
  }

  resolveConfigProfile(req: ResolveConfigProfileRequest) {
    return this.pluginCommand<any>('resolve_config', {
      configId: req.configFilePath,
      profile: req.profile ?? null,
    }).then((response) => fromResolvedConfig(response));
  }

  getRuntimeCatalog() {
    return this.pluginCommand<RuntimeCatalog>('get_runtime_catalog');
  }

  stageLocalImage(req: StageLocalImageRequest) {
    return this.appCommand<StageLocalImageResponse>('assistant_stage_local_image', { ...req });
  }

  applyProposal(req: ApplyProposalRequest) {
    return this.appCommand<ApplyProposalAck>('assistant_apply_proposal', { ...req });
  }

  simulateProposal(req: ApplyProposalRequest) {
    return this.appCommand<ProposalSimulationReport>('assistant_simulate_proposal', { ...req });
  }

  getDailyAutomationStatus() {
    return this.appCommand<DailyAutomationStatus>('assistant_get_daily_automation_status');
  }

  runDailyAutomationNow() {
    return this.appCommand<DailyAutomationRunNowAck>('assistant_run_daily_automation_now');
  }

  onStatus(handler: (event: AssistantStatusEventEnvelope) => void): Promise<UnlistenFn> {
    return listen<AssistantStatusEventEnvelope>(this.statusEvent, (event) => handler(event.payload));
  }

  onThreadsChanged(
    handler: (event: AssistantStatusEventEnvelope<AssistantThreadsChangedPayload>) => void,
  ): Promise<UnlistenFn> {
    return listen<AssistantStatusEventEnvelope<AssistantThreadsChangedPayload>>(
      this.threadsChangedEvent,
      (event) => handler(event.payload),
    );
  }

  onDebug(
    handler: (event: AssistantStatusEventEnvelope<AssistantDebugPayload>) => void,
  ): Promise<UnlistenFn> {
    return listen<AssistantStatusEventEnvelope<AssistantDebugPayload>>(this.debugEvent, (event) =>
      handler(event.payload),
    );
  }
}

export const assistantRuntimeClient = new AssistantRuntimeClient();
