export interface ConfigSelection {
  configFilePath: string;
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
  agentId?: string | null;
  requestedAgentId?: string | null;
  collaborationMode: string;
  routingSource: string;
}

export interface PlanStep {
  step: string;
  status: string;
}

export interface ThreadPlanState {
  explanation?: string | null;
  plan: PlanStep[];
  updatedAt: string;
  source: string;
}

export type ProposalActionType = string;

export interface ProposalAction {
  action_id: string;
  action_type: ProposalActionType;
  target_type: string;
  target_id: string | null;
  title: string;
  summary: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown>;
}

export interface ProposalArtifact {
  artifact_id: string;
  artifact_type: string;
  title: string;
  content_json: Record<string, unknown>;
}

export interface ProposalPayload {
  schema_version: string;
  contract_id?: string | null;
  proposal_id: string;
  thread_id: string;
  turn_id: string;
  generated_at: string;
  summary: string;
  intent: string;
  reasoning_summary: string | null;
  warnings: string[];
  requires_confirmation: boolean;
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
  planState?: ThreadPlanState | null;
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
  agentId?: string | null;
  mode: 'default' | 'plan' | 'access' | string;
  attachments?: AttachmentRef[];
  modelOverride?: string | null;
  configContext?: ConfigSelection | null;
}

export interface StartTurnAck {
  threadId: string;
  turnId: string;
  acceptedAt: string;
  requestedAgentId?: string | null;
  resolvedAgentId?: string | null;
  collaborationMode?: string | null;
  routingSource?: string | null;
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

export interface ConfigFileCandidate {
  path: string;
  source: string;
  exists: boolean;
  isDefault: boolean;
}

export interface ListConfigFilesResponse {
  items: ConfigFileCandidate[];
}

export interface ResolvedConfig {
  configFilePath: string;
  profile: string | null;
  model: string;
  provider: string;
  baseUrl: string | null;
  envKey: string | null;
  wireApi: string;
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
  payload: Record<string, unknown>;
  createdAt: string;
}

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

export interface ApplyProposalRequest {
  threadId: string;
  turnId: string;
  proposalId: string;
}

export interface ApplyProposalAck {
  accepted: boolean;
  applyRunId: string;
}

export interface ProposalSimulationAction {
  actionId: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  title: string;
  summary: string;
}

export interface ProposalSimulationReport {
  proposalId: string;
  valid: boolean;
  actionCount: number;
  actionTypeCounts: Record<string, number>;
  actions: ProposalSimulationAction[];
  notices: string[];
}

export interface StageLocalImageRequest {
  filename: string;
  mimeType?: string | null;
  data: number[];
}

export interface StageLocalImageResponse {
  attachment: AttachmentRef;
}

export interface DailyAutomationConfig {
  enabled: boolean;
  localTime: string;
  configFilePath: string | null;
  configProfile: string | null;
  maxAttempts: number;
  retryDelayMinutes: number;
}

export interface DailyAutomationRun {
  runId: string;
  runKey: string;
  automationKind: string;
  triggerKind: string;
  runDate: string | null;
  status: string;
  attemptCount: number;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
  threadId: string | null;
  turnId: string | null;
  proposalId: string | null;
  summary: string | null;
  error: string | null;
  updatedAt: string;
}

export interface DailyAutomationStatus {
  config: DailyAutomationConfig;
  activeRun: DailyAutomationRun | null;
  lastCompletedRun: DailyAutomationRun | null;
  recentRuns: DailyAutomationRun[];
}

export interface DailyAutomationRunNowAck {
  accepted: boolean;
  runId: string;
}

export interface ResolveConfigProfileRequest {
  configFilePath: string;
  profile?: string | null;
}
