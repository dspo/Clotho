import type {
  ConfigSelection,
  ConversationBlock,
  PendingRuntimeRequest,
  ProposalPayload,
  ResolvedConfig,
} from '@/types/assistant-runtime';

export interface PendingRuntimeRequestView extends PendingRuntimeRequest {
  turnId: string | null;
}

const THREAD_PREVIEW_MAX_LENGTH = 96;
const PROPOSAL_SCHEMA_VERSION = 'clotho.assistant.proposal.v1alpha1';
const DEPENDENCY_ACTION_TYPES = new Set(['create_dependency', 'delete_dependency']);

export function assistantTurnKey(threadId: string, turnId: string) {
  return `${threadId}:${turnId}`;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readString(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : null;
}

export function readBoolean(
  value: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  const candidate = value?.[key];
  return typeof candidate === 'boolean' ? candidate : null;
}

export function readArray(
  value: Record<string, unknown> | null | undefined,
  key: string,
): unknown[] | null {
  const candidate = value?.[key];
  return Array.isArray(candidate) ? candidate : null;
}

export function getBlockTurnId(block: ConversationBlock): string | null {
  return readString(asRecord(block.metadata), 'turnId');
}

export function isBlockHidden(block: ConversationBlock) {
  return readBoolean(asRecord(block.metadata), 'hidden') === true;
}

export function getProposalPayload(block: ConversationBlock): ProposalPayload | null {
  const metadata = asRecord(block.metadata);
  const proposal = asRecord(metadata?.proposal);
  if (!proposal) {
    return null;
  }
  return proposal as unknown as ProposalPayload;
}

export function truncateThreadPreview(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= THREAD_PREVIEW_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, THREAD_PREVIEW_MAX_LENGTH - 1)}…`;
}

export function deriveThreadPreview(blocks: ConversationBlock[], fallbackTitle: string) {
  const lastMeaningfulBlock = [...blocks]
    .reverse()
    .find((block) => !isBlockHidden(block) && block.text.trim().length > 0);
  if (!lastMeaningfulBlock) {
    return fallbackTitle;
  }
  return truncateThreadPreview(lastMeaningfulBlock.text);
}

function unwrapSingleCodeFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return null;
  }
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline === -1) {
    return null;
  }
  const rest = trimmed.slice(firstNewline + 1);
  const lastFence = rest.lastIndexOf('```');
  if (lastFence === -1) {
    return null;
  }
  const trailing = rest.slice(lastFence + 3).trim();
  if (trailing.length > 0) {
    return null;
  }
  return rest.slice(0, lastFence).trim();
}

function extractJsonCandidate(text: string) {
  const trimmed = text.trim();
  try {
    return { value: JSON.parse(trimmed) as unknown, consumeSourceMessage: true };
  } catch {}

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = text.slice(firstBrace, lastBrace + 1);
  try {
    return {
      value: JSON.parse(candidate) as unknown,
      consumeSourceMessage:
        text.slice(0, firstBrace).trim().length === 0 &&
        text.slice(lastBrace + 1).trim().length === 0,
    };
  } catch {
    return null;
  }
}

function parseNestedJson(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function normalizeAction(value: unknown) {
  const action = asRecord(value);
  const actionType = readString(action, 'action_type') ?? readString(action, 'actionType');
  if (!actionType) {
    return null;
  }

  return {
    action_id:
      readString(action, 'action_id') ??
      readString(action, 'actionId') ??
      crypto.randomUUID(),
    action_type: actionType,
    target_type:
      readString(action, 'target_type') ??
      readString(action, 'targetType') ??
      (DEPENDENCY_ACTION_TYPES.has(actionType) ? 'dependency' : 'task'),
    target_id: readString(action, 'target_id') ?? readString(action, 'targetId'),
    title: readString(action, 'title') ?? actionType,
    summary: readString(action, 'summary') ?? '',
    before_json: parseNestedJson(action?.before_json ?? action?.beforeJson),
    after_json: parseNestedJson(action?.after_json ?? action?.afterJson) ?? {},
  };
}

function normalizeArtifact(value: unknown) {
  const artifact = asRecord(value);
  const artifactType =
    readString(artifact, 'artifact_type') ?? readString(artifact, 'artifactType');
  if (!artifactType) {
    return null;
  }

  return {
    artifact_id:
      readString(artifact, 'artifact_id') ??
      readString(artifact, 'artifactId') ??
      crypto.randomUUID(),
    artifact_type: artifactType,
    title: readString(artifact, 'title') ?? artifactType,
    content_json: parseNestedJson(artifact?.content_json ?? artifact?.contentJson) ?? {},
  };
}

export function extractProposalFromText(
  text: string,
  threadId: string,
  turnId: string,
): { proposal: ProposalPayload; consumeSourceMessage: boolean } | null {
  const fenced = unwrapSingleCodeFence(text);
  const candidate =
    (fenced ? extractJsonCandidate(fenced) : null) ?? extractJsonCandidate(text);
  const value = asRecord(candidate?.value);
  if (!value) {
    return null;
  }

  const summary = readString(value, 'summary');
  const intent = readString(value, 'intent');
  if (!summary || !intent) {
    return null;
  }

  const actions = (readArray(value, 'actions') ?? [])
    .map(normalizeAction)
    .filter((action): action is NonNullable<typeof action> => action !== null);
  const artifacts = (readArray(value, 'artifacts') ?? [])
    .map(normalizeArtifact)
    .filter((artifact): artifact is NonNullable<typeof artifact> => artifact !== null);

  return {
    proposal: {
      schema_version:
        readString(value, 'schema_version') ??
        readString(value, 'schemaVersion') ??
        PROPOSAL_SCHEMA_VERSION,
      proposal_id:
        readString(value, 'proposal_id') ??
        readString(value, 'proposalId') ??
        crypto.randomUUID(),
      thread_id: readString(value, 'thread_id') ?? readString(value, 'threadId') ?? threadId,
      turn_id: readString(value, 'turn_id') ?? readString(value, 'turnId') ?? turnId,
      generated_at:
        readString(value, 'generated_at') ??
        readString(value, 'generatedAt') ??
        new Date().toISOString(),
      summary,
      intent,
      reasoning_summary:
        readString(value, 'reasoning_summary') ?? readString(value, 'reasoningSummary'),
      warnings: (readArray(value, 'warnings') ?? []).filter(
        (item): item is string => typeof item === 'string',
      ),
      requires_confirmation:
        readBoolean(value, 'requires_confirmation') ??
        readBoolean(value, 'requiresConfirmation') ??
        true,
      actions,
      artifacts,
    },
    consumeSourceMessage: candidate?.consumeSourceMessage ?? false,
  };
}

export function buildConfigSelection(
  config: ResolvedConfig | ConfigSelection | null | undefined,
): ConfigSelection | null {
  if (!config) {
    return null;
  }

  if ('model' in config) {
    return {
      configFilePath: config.configFilePath,
      profile: config.profile ?? null,
    };
  }

  return {
    configFilePath: config.configFilePath,
    profile: config.profile ?? null,
  };
}

export function buildPendingRuntimeRequestViews(
  blocks: ConversationBlock[],
  pendingRequests: PendingRuntimeRequest[],
): PendingRuntimeRequestView[] {
  return pendingRequests.map((request) => {
    const block = blocks.find((candidate) => candidate.blockId === request.requestId);
    return {
      ...request,
      turnId: block ? getBlockTurnId(block) : null,
    };
  });
}
