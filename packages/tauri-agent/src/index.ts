import { Channel, invoke, type InvokeArgs } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface ConfigSelection {
  configId?: string | null;
  profile?: string | null;
}

export interface AttachmentRef {
  kind?: string | null;
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  path?: string | null;
}

export interface ThreadSummary {
  threadId: string;
  title: string;
  lastMessagePreview: string;
  updatedAt: string;
  hasRunningTurn: boolean;
}

export interface ListThreadsResponse {
  items: ThreadSummary[];
  nextCursor: string | null;
}

export interface ConversationBlock {
  blockId: string;
  kind: string;
  title: string | null;
  text: string;
  status: string | null;
  metadata: unknown | null;
}

export interface TurnSummarySnapshot {
  turnId: string;
  status: string;
  acceptedAt: string;
  lastSeq: number;
}

export type WireApi = 'responses' | 'chat_completions';

export interface ResolvedConfig {
  configId: string;
  label: string;
  source: string;
  configFilePath: string | null;
  profile: string | null;
  model: string;
  provider: string;
  baseUrl: string | null;
  envKey: string | null;
  wireApi: WireApi;
  approvalPolicy: string | null;
  sandboxMode: string | null;
  reasoningEffort: string | null;
  reasoningSummary: string | null;
  verbosity: string | null;
  personality: string | null;
  serviceTier: string | null;
  providerConfig: Record<string, unknown> | null;
}

export interface PendingRuntimeRequest {
  requestId: string;
  requestKind: string;
  itemId?: string | null;
  approvalId?: string | null;
  title?: string | null;
  summary?: string | null;
  payload: unknown;
  createdAt: string;
}

export type ProposalActionType =
  | 'create_task'
  | 'update_task'
  | 'reschedule_task'
  | 'batch_update_tasks'
  | 'create_dependency'
  | 'delete_dependency'
  | 'add_task_tag'
  | 'remove_task_tag';

export interface ProposalAction {
  actionId: string;
  actionType: ProposalActionType;
  targetType: string;
  targetId: string | null;
  title: string;
  summary: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown>;
}

export interface ProposalArtifact {
  artifactId: string;
  artifactType: string;
  title: string;
  contentJson: Record<string, unknown>;
}

export interface ProposalPayload {
  schemaVersion: string;
  proposalId: string;
  threadId: string;
  turnId: string;
  generatedAt: string;
  summary: string;
  intent: string;
  reasoningSummary: string | null;
  warnings: string[];
  requiresConfirmation: boolean;
  actions: ProposalAction[];
  artifacts: ProposalArtifact[];
}

export interface ThreadSnapshot {
  threadId: string;
  title: string;
  blocks: ConversationBlock[];
  activeTurn: TurnSummarySnapshot | null;
  configContext: ResolvedConfig | null;
  pendingRequests: PendingRuntimeRequest[];
}

export interface CreateThreadRequest {
  title?: string | null;
  configContext?: ConfigSelection | null;
}

export interface CreateThreadResponse {
  threadId: string;
  title: string;
}

export interface StartTurnRequest {
  threadId: string;
  text: string;
  mode: 'plan' | 'access' | string;
  attachments?: AttachmentRef[];
  modelOverride?: string | null;
  configContext?: ConfigSelection | null;
}

export interface StartTurnAck {
  threadId: string;
  turnId: string;
  acceptedAt: string;
}

export interface ResumeTurnStreamRequest {
  threadId: string;
  turnId: string;
  afterSeq?: number | null;
}

export interface ResumeTurnStreamAck {
  threadId: string;
  turnId: string;
  resumed: boolean;
}

export interface CancelTurnRequest {
  threadId: string;
  turnId: string;
}

export interface CancelTurnAck {
  threadId: string;
  turnId: string;
  accepted: boolean;
}

export interface SubmitRuntimeRequestRequest {
  threadId: string;
  turnId: string;
  requestId: string;
  response: unknown;
}

export interface SubmitRuntimeRequestAck {
  accepted: boolean;
  requestKind: string;
}

export interface ConfigDescriptor {
  configId: string;
  label: string;
  source: string;
  configFilePath: string | null;
  exists: boolean;
  isDefault: boolean;
}

export interface ListConfigsResponse {
  items: ConfigDescriptor[];
}

export interface ResolveConfigRequest {
  configId?: string | null;
  profile?: string | null;
}

export type ConfigFileCandidate = ConfigDescriptor;
export type ListConfigFilesResponse = ListConfigsResponse;
export type ResolveConfigProfileRequest = ResolveConfigRequest;

export interface RuntimeCatalogTool {
  name: string;
  description: string;
}

export interface NativeToolAuditEntry {
  auditId: string;
  toolName: string;
  callId: string;
  runtimeThreadId: string;
  runtimeTurnId: string;
  localThreadId: string | null;
  localTurnId: string | null;
  executedAt: string;
  durationMs: number;
  success: boolean;
  summary: string;
  arguments: unknown;
  result: unknown;
}

export interface RuntimeCatalogSkill {
  name: string;
  description: string | null;
  path: string;
}

export interface RuntimeCatalogIntegration {
  name: string;
  kind: string;
  status: string;
  detail: string | null;
}

export interface RuntimeCatalog {
  tools: RuntimeCatalogTool[];
  toolAuditLogPath: string | null;
  toolAudits: NativeToolAuditEntry[];
  skills: RuntimeCatalogSkill[];
  integrations: RuntimeCatalogIntegration[];
}

export interface AssistantTurnStreamEnvelope<TPayload = unknown> {
  streamId: string;
  itemId: string;
  seq: number;
  emittedAt: string;
  threadId: string;
  turnId: string;
  source: 'runtime' | 'plugin' | 'apply' | string;
  kind: string;
  payload: TPayload;
}

export interface AssistantStatusEventEnvelope<TPayload = unknown> {
  eventId: string;
  emittedAt: string;
  source: 'plugin' | 'system' | string;
  type: string;
  payload: TPayload;
}

export interface AssistantConnectionStatusPayload {
  state: string;
}

export interface AssistantThreadsChangedPayload {
  reason: string;
  threadId?: string | null;
}

export interface AssistantDebugPayload {
  message: string;
}

export type PermissionSet = 'read-only' | 'operator' | 'automation' | 'debug' | (string & {});

export interface ToolBindingSpec {
  toolId: string;
  permission?: PermissionSet;
}

export interface SkillBindingSpec {
  skillId: string;
}

export interface ResourceBindingSpec {
  resourceId: string;
  required?: boolean;
}

export interface SoulSpec {
  markdown: string;
  source?: string;
  summary?: string;
}

export interface AgentSpec {
  id: string;
  name?: string;
  description?: string;
  soul?: SoulSpec | null;
  instructions?: string;
  modelProfile?: Record<string, unknown> | null;
  toolBindings?: ToolBindingSpec[];
  skillBindings?: SkillBindingSpec[];
  resourceBindings?: ResourceBindingSpec[];
  actionPolicy?: 'direct' | 'proposal-only' | 'approval-required';
  outputContract?: 'freeform-text' | 'structured-artifact' | 'proposal';
  automationHooks?: Record<string, unknown> | null;
  uiMetadata?: Record<string, unknown> | null;
}

export interface DomainSpec {
  id: string;
  resources?: ResourceBindingSpec[];
  actions?: Array<{ id: string; description?: string }>;
  tools?: ToolBindingSpec[];
}

export const builtinPermissionSets = ['read-only', 'operator', 'automation', 'debug'] as const;

export function defineSoul<T extends SoulSpec>(spec: T): T {
  return spec;
}

export function defineAgent<T extends AgentSpec>(spec: T): T {
  return spec;
}

export function defineDomain<T extends DomainSpec>(spec: T): T {
  return spec;
}

export interface ComposeAgentTurnTextOptions {
  userText: string;
  extraInstructions?: string[];
}

function normalizeMultilineText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildPromptSection(title: string, body: string): string {
  return `# ${title}\n${body}`;
}

export function composeAgentTurnText(
  agent: Pick<AgentSpec, 'soul' | 'instructions'>,
  options: ComposeAgentTurnTextOptions,
): string {
  const sections: string[] = [];
  const soulMarkdown = normalizeMultilineText(agent.soul?.markdown);

  if (soulMarkdown) {
    const soulPreamble: string[] = [];
    const soulSource = normalizeMultilineText(agent.soul?.source);
    const soulSummary = normalizeMultilineText(agent.soul?.summary);

    if (soulSource) {
      soulPreamble.push(`Source: ${soulSource}`);
    }

    if (soulSummary) {
      soulPreamble.push(`Summary: ${soulSummary}`);
    }

    const soulBody = soulPreamble.length > 0
      ? `${soulPreamble.join('\n')}\n\n${soulMarkdown}`
      : soulMarkdown;
    sections.push(buildPromptSection('SOUL.MD', soulBody));
    sections.push(
      buildPromptSection(
        'Boundary reminder',
        [
          'Stay within the role, scope, tool, and refusal boundaries declared in SOUL.MD.',
          'If the user asks for anything outside that scope, decline briefly and redirect to the supported capability.',
        ].join('\n'),
      ),
    );
  }

  const instructions = normalizeMultilineText(agent.instructions);
  if (instructions) {
    sections.push(buildPromptSection('Agent instructions', instructions));
  }

  sections.push(buildPromptSection('User request', options.userText.trim()));

  const extraInstructions =
    options.extraInstructions
      ?.map((instruction) => normalizeMultilineText(instruction))
      .filter((instruction): instruction is string => instruction !== null) ?? [];
  if (extraInstructions.length > 0) {
    sections.push(
      buildPromptSection(
        'Runtime reminders',
        extraInstructions.map((instruction) => `- ${instruction}`).join('\n'),
      ),
    );
  }

  return sections.join('\n\n');
}

export interface TauriAgentClientOptions {
  plugin?: string;
  statusEvent?: string;
  threadsChangedEvent?: string;
  debugEvent?: string;
}

export const DEFAULT_TAURI_AGENT_PLUGIN = 'agent-runtime' as const;
export const DEFAULT_TAURI_AGENT_STATUS_EVENT = 'agent-runtime://status' as const;
export const DEFAULT_TAURI_AGENT_THREADS_CHANGED_EVENT =
  'agent-runtime://threads-changed' as const;
export const DEFAULT_TAURI_AGENT_DEBUG_EVENT = 'agent-runtime://debug' as const;

export class TauriAgentClient {
  readonly plugin: string;
  readonly statusEvent: string;
  readonly threadsChangedEvent: string;
  readonly debugEvent: string;

  constructor(options: TauriAgentClientOptions = {}) {
    this.plugin = options.plugin ?? DEFAULT_TAURI_AGENT_PLUGIN;
    this.statusEvent = options.statusEvent ?? DEFAULT_TAURI_AGENT_STATUS_EVENT;
    this.threadsChangedEvent =
      options.threadsChangedEvent ?? DEFAULT_TAURI_AGENT_THREADS_CHANGED_EVENT;
    this.debugEvent = options.debugEvent ?? DEFAULT_TAURI_AGENT_DEBUG_EVENT;
  }

  private command<T>(name: string, args?: InvokeArgs) {
    return invoke<T>(`plugin:${this.plugin}|${name}`, args);
  }

  listThreads(req?: { limit?: number; cursor?: string | null }) {
    return this.command<ListThreadsResponse>('list_threads', req ? { ...req } : undefined);
  }

  getThreadSnapshot(threadId: string) {
    return this.command<ThreadSnapshot>('get_thread_snapshot', { threadId });
  }

  createThread(req?: CreateThreadRequest) {
    return this.command<CreateThreadResponse>('create_thread', req ? { ...req } : undefined);
  }

  startTurn(req: StartTurnRequest, onItem: (item: AssistantTurnStreamEnvelope) => void) {
    const onEvent = new Channel<AssistantTurnStreamEnvelope>(onItem);
    return this.command<StartTurnAck>('start_turn', { ...req, onEvent });
  }

  resumeTurnStream(
    req: ResumeTurnStreamRequest,
    onItem: (item: AssistantTurnStreamEnvelope) => void,
  ) {
    const onEvent = new Channel<AssistantTurnStreamEnvelope>(onItem);
    return this.command<ResumeTurnStreamAck>('resume_turn_stream', { ...req, onEvent });
  }

  cancelTurn(req: CancelTurnRequest) {
    return this.command<CancelTurnAck>('cancel_turn', { ...req });
  }

  submitRuntimeRequest(req: SubmitRuntimeRequestRequest) {
    return this.command<SubmitRuntimeRequestAck>('submit_runtime_request', { ...req });
  }

  listConfigs() {
    return this.command<ListConfigsResponse>('list_configs');
  }

  listConfigFiles() {
    return this.listConfigs();
  }

  resolveConfig(req?: ResolveConfigRequest) {
    return this.command<ResolvedConfig>('resolve_config', req ? { ...req } : undefined);
  }

  resolveConfigProfile(req?: ResolveConfigProfileRequest) {
    return this.resolveConfig(req);
  }

  getRuntimeCatalog() {
    return this.command<RuntimeCatalog>('get_runtime_catalog');
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

export const defaultTauriAgentClient = new TauriAgentClient();
