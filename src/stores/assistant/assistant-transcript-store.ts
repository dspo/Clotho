import { create } from 'zustand';
import type {
  AssistantTurnStreamEnvelope,
  ConversationBlock,
  PendingRuntimeRequest,
  ThreadSnapshot,
  TurnSummarySnapshot,
} from '@/types/assistant-runtime';
import {
  assistantTurnKey,
  asRecord,
  buildPendingRuntimeRequestViews,
  extractProposalFromText,
  getBlockTurnId,
  type PendingRuntimeRequestView,
  readBoolean,
  readString,
} from './helpers';

interface TranscriptThreadState {
  blocks: ConversationBlock[];
  activeTurn: TurnSummarySnapshot | null;
  pendingRequests: PendingRuntimeRequestView[];
}

interface AssistantTranscriptState {
  threads: Record<string, TranscriptThreadState>;
  turnSeqCursor: Record<string, number>;

  hydrateThread: (snapshot: ThreadSnapshot) => void;
  appendOptimisticUserMessage: (threadId: string, text: string) => void;
  clearThread: (threadId: string) => void;
  setActiveTurn: (
    threadId: string,
    turnId: string,
    acceptedAt: string,
    lastSeq?: number,
  ) => void;
  applyStreamItem: (item: AssistantTurnStreamEnvelope) => boolean;
}

function createEmptyThreadState(): TranscriptThreadState {
  return {
    blocks: [],
    activeTurn: null,
    pendingRequests: [],
  };
}

function metadataWithTurn(turnId: string, payload: unknown) {
  const metadata: Record<string, unknown> = asRecord(payload)
    ? { ...(payload as Record<string, unknown>) }
    : { payload };
  if (!('turnId' in metadata)) {
    metadata.turnId = turnId;
  }
  return metadata;
}

function getOrCreateBlock(
  blocks: ConversationBlock[],
  blockId: string,
  kind: string,
  title: string | null,
  turnId: string,
) {
  const existing = blocks.find((block) => block.blockId === blockId);
  if (existing) {
    return existing;
  }

  const created: ConversationBlock = {
    blockId,
    kind,
    title,
    text: '',
    status: null,
    metadata: { turnId },
  };
  blocks.push(created);
  return created;
}

function upsertPendingRequest(
  pendingRequests: PendingRuntimeRequestView[],
  request: PendingRuntimeRequest,
  turnId: string,
) {
  const currentIndex = pendingRequests.findIndex(
    (candidate) => candidate.requestId === request.requestId,
  );
  const nextRequest: PendingRuntimeRequestView = {
    ...request,
    turnId,
  };

  if (currentIndex === -1) {
    pendingRequests.push(nextRequest);
    return;
  }

  pendingRequests[currentIndex] = nextRequest;
}

function removePendingRequest(
  pendingRequests: PendingRuntimeRequestView[],
  requestId: string,
) {
  return pendingRequests.filter((request) => request.requestId !== requestId);
}

function completeStreamingBlocksForTurn(blocks: ConversationBlock[], turnId: string) {
  for (const block of blocks) {
    if (getBlockTurnId(block) !== turnId) {
      continue;
    }

    if (block.status === 'streaming') {
      block.status = 'completed';
      continue;
    }

    if (block.kind === 'runtime_request' && block.status === 'pending') {
      block.status = 'expired';
    }
  }
}

function mergeRuntimeRequestResolution(
  block: ConversationBlock,
  payload: unknown,
  emittedAt: string,
) {
  const metadata = asRecord(block.metadata) ?? {};
  metadata.resolvedAt = emittedAt;
  metadata.resolution = payload;
  block.metadata = metadata;
}

function mergeBlockMetadata(
  block: ConversationBlock,
  turnId: string,
  payload: unknown,
) {
  block.metadata = {
    ...(asRecord(block.metadata) ?? {}),
    ...metadataWithTurn(turnId, payload),
  };
}

function hideBlock(blocks: ConversationBlock[], blockId: string) {
  const block = blocks.find((candidate) => candidate.blockId === blockId);
  if (!block) {
    return;
  }

  const metadata = asRecord(block.metadata) ?? {};
  metadata.hidden = true;
  block.metadata = metadata;
}

function ensureDerivedProposalBlock(
  blocks: ConversationBlock[],
  threadId: string,
  turnId: string,
) {
  const existing = blocks.find(
    (block) => block.kind === 'proposal' && getBlockTurnId(block) === turnId,
  );
  if (existing) {
    return;
  }

  const sourceBlock = [...blocks]
    .reverse()
    .find((block) => block.kind === 'assistant_message' && getBlockTurnId(block) === turnId);
  if (!sourceBlock) {
    return;
  }

  const extracted = extractProposalFromText(sourceBlock.text, threadId, turnId);
  if (!extracted) {
    return;
  }

  const proposalBlock = getOrCreateBlock(
    blocks,
    extracted.proposal.proposal_id,
    'proposal',
    '提案',
    turnId,
  );
  proposalBlock.text = extracted.proposal.summary;
  proposalBlock.status = proposalBlock.status ?? 'preview';
  proposalBlock.metadata = {
    ...(asRecord(proposalBlock.metadata) ?? {}),
    turnId,
    proposal: extracted.proposal,
    sourceMessageId: sourceBlock.blockId,
    consumeSourceMessage: extracted.consumeSourceMessage,
  };

  if (extracted.consumeSourceMessage) {
    hideBlock(blocks, sourceBlock.blockId);
  }
}

function materializeDerivedProposalBlocks(blocks: ConversationBlock[], threadId: string) {
  const turnIds = Array.from(
    new Set(blocks.map((block) => getBlockTurnId(block)).filter((value): value is string => Boolean(value))),
  );
  for (const turnId of turnIds) {
    ensureDerivedProposalBlock(blocks, threadId, turnId);
  }
}

export const useAssistantTranscriptStore = create<AssistantTranscriptState>()((set) => ({
  threads: {},
  turnSeqCursor: {},

  hydrateThread: (snapshot) =>
    set((state) => {
      const blocks = [...snapshot.blocks];
      materializeDerivedProposalBlocks(blocks, snapshot.threadId);

      return {
        threads: {
          ...state.threads,
          [snapshot.threadId]: {
            blocks,
            activeTurn: snapshot.activeTurn,
            pendingRequests: buildPendingRuntimeRequestViews(blocks, snapshot.pendingRequests),
          },
        },
        turnSeqCursor: snapshot.activeTurn
          ? {
              ...state.turnSeqCursor,
              [assistantTurnKey(snapshot.threadId, snapshot.activeTurn.turnId)]:
                snapshot.activeTurn.lastSeq,
            }
          : state.turnSeqCursor,
      };
    }),

  appendOptimisticUserMessage: (threadId, text) =>
    set((state) => {
      const thread = state.threads[threadId] ?? createEmptyThreadState();
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...thread,
            blocks: [
              ...thread.blocks,
              {
                blockId: `optimistic-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                kind: 'user_message',
                title: null,
                text: text.trim(),
                status: 'completed',
                metadata: { optimistic: true },
              },
            ],
          },
        },
      };
    }),

  clearThread: (threadId) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: createEmptyThreadState(),
      },
    })),

  setActiveTurn: (threadId, turnId, acceptedAt, lastSeq = 0) =>
    set((state) => {
      const thread = state.threads[threadId] ?? createEmptyThreadState();
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...thread,
            activeTurn: {
              turnId,
              status: 'running',
              acceptedAt,
              lastSeq,
              agentId: null,
              requestedAgentId: null,
              collaborationMode: 'default',
              routingSource: 'direct',
            },
          },
        },
        turnSeqCursor: {
          ...state.turnSeqCursor,
          [assistantTurnKey(threadId, turnId)]: lastSeq,
        },
      };
    }),

  applyStreamItem: (item) => {
    let applied = false;

    set((state) => {
      const turnKey = assistantTurnKey(item.threadId, item.turnId);
      const currentSeq = state.turnSeqCursor[turnKey] ?? 0;
      if (item.seq <= currentSeq) {
        return state;
      }

      const thread = state.threads[item.threadId] ?? createEmptyThreadState();
      const blocks = [...thread.blocks];
      let pendingRequests = [...thread.pendingRequests];
      let activeTurn = thread.activeTurn;
      const payload = asRecord(item.payload);

      if (!activeTurn || activeTurn.turnId !== item.turnId) {
        activeTurn = {
          turnId: item.turnId,
          status: 'running',
          acceptedAt: item.emittedAt,
          lastSeq: item.seq,
          agentId: null,
          requestedAgentId: null,
          collaborationMode: 'default',
          routingSource: 'direct',
        };
      } else {
        activeTurn = {
          ...activeTurn,
          lastSeq: item.seq,
        };
      }

      switch (item.kind) {
        case 'turn_started': {
          activeTurn = {
            ...activeTurn,
            requestedAgentId: readString(payload, 'requestedAgentId'),
            agentId: readString(payload, 'resolvedAgentId'),
            collaborationMode: readString(payload, 'collaborationMode') ?? 'default',
            routingSource: readString(payload, 'routingSource') ?? 'direct',
          };
          const title = readString(payload, 'title');
          if (title) {
            const userBlock = [...blocks]
              .reverse()
              .find((block) => block.kind === 'user_message' && asRecord(block.metadata)?.optimistic);
            if (userBlock) {
              const metadata = asRecord(userBlock.metadata) ?? {};
              delete metadata.optimistic;
              userBlock.metadata = metadata;
            }
          }
          break;
        }
        case 'reasoning_started': {
          const blockId = readString(payload, 'blockId') ?? `reasoning-${item.seq}`;
          const block = getOrCreateBlock(blocks, blockId, 'reasoning', '分析中', item.turnId);
          block.status = 'streaming';
          break;
        }
        case 'reasoning_delta': {
          const blockId = readString(payload, 'blockId') ?? `reasoning-${item.seq}`;
          const block = getOrCreateBlock(blocks, blockId, 'reasoning', '分析中', item.turnId);
          block.text += readString(payload, 'textDelta') ?? '';
          block.status = 'streaming';
          break;
        }
        case 'reasoning_completed': {
          const blockId = readString(payload, 'blockId');
          if (blockId) {
            const block = blocks.find((candidate) => candidate.blockId === blockId);
            if (block) {
              block.status = 'completed';
            }
          }
          break;
        }
        case 'assistant_message_delta': {
          const blockId = readString(payload, 'messageId') ?? `assistant-${item.seq}`;
          const block = getOrCreateBlock(
            blocks,
            blockId,
            'assistant_message',
            null,
            item.turnId,
          );
          block.text += readString(payload, 'textDelta') ?? '';
          block.status = 'streaming';
          break;
        }
        case 'tool_call_started': {
          const blockId = readString(payload, 'toolCallId') ?? `tool-${item.seq}`;
          const toolName = readString(payload, 'toolName') ?? 'tool';
          const block = getOrCreateBlock(blocks, blockId, 'tool_call', toolName, item.turnId);
          const summary = readString(payload, 'summary');
          if (summary) {
            block.text = summary;
          }
          block.status = 'running';
          block.metadata = metadataWithTurn(item.turnId, item.payload);
          break;
        }
        case 'tool_call_finished': {
          const blockId = readString(payload, 'toolCallId') ?? `tool-${item.seq}`;
          const toolName = readString(payload, 'toolName') ?? 'tool';
          const block = getOrCreateBlock(blocks, blockId, 'tool_call', toolName, item.turnId);
          const summary = readString(payload, 'summary');
          if (summary) {
            block.text = summary;
          }
          block.status = readString(payload, 'status') ?? 'completed';
          block.metadata = metadataWithTurn(item.turnId, item.payload);
          break;
        }
        case 'runtime_request_pending': {
          const requestId = readString(payload, 'requestId') ?? `request-${item.seq}`;
          const title =
            readString(payload, 'title') ??
            readString(payload, 'requestKind') ??
            'runtime_request';
          const block = getOrCreateBlock(
            blocks,
            requestId,
            'runtime_request',
            title,
            item.turnId,
          );
          block.text = readString(payload, 'summary') ?? '';
          block.status = 'pending';
          block.metadata = metadataWithTurn(item.turnId, item.payload);
          upsertPendingRequest(
            pendingRequests,
            item.payload as PendingRuntimeRequest,
            item.turnId,
          );
          break;
        }
        case 'runtime_request_resolved': {
          const requestId = readString(payload, 'requestId') ?? `request-${item.seq}`;
          const title =
            readString(payload, 'requestKind') ??
            readString(payload, 'title') ??
            'runtime_request';
          const block = getOrCreateBlock(
            blocks,
            requestId,
            'runtime_request',
            title,
            item.turnId,
          );
          block.status = 'completed';
          mergeRuntimeRequestResolution(block, item.payload, item.emittedAt);
          pendingRequests = removePendingRequest(pendingRequests, requestId);
          break;
        }
        case 'proposal_ready': {
          const proposalId = readString(payload, 'proposalId') ?? `proposal-${item.seq}`;
          const block = getOrCreateBlock(
            blocks,
            proposalId,
            'proposal',
            '提案',
            item.turnId,
          );
          block.text = readString(payload, 'summary') ?? 'Proposal';
          block.status = 'preview';
          mergeBlockMetadata(block, item.turnId, item.payload);

          if (readBoolean(payload, 'consumeSourceMessage')) {
            const sourceMessageId = readString(payload, 'sourceMessageId');
            if (sourceMessageId) {
              hideBlock(blocks, sourceMessageId);
            }
          }
          break;
        }
        case 'proposal_apply_started': {
          ensureDerivedProposalBlock(blocks, item.threadId, item.turnId);
          const proposalId = readString(payload, 'proposalId') ?? `proposal-${item.seq}`;
          const block = getOrCreateBlock(
            blocks,
            proposalId,
            'proposal',
            '提案',
            item.turnId,
          );
          const summary = readString(payload, 'summary');
          if (summary) {
            block.text = summary;
          }
          block.status = 'applying';
          mergeBlockMetadata(block, item.turnId, item.payload);
          break;
        }
        case 'proposal_apply_finished': {
          ensureDerivedProposalBlock(blocks, item.threadId, item.turnId);
          const proposalId = readString(payload, 'proposalId') ?? `proposal-${item.seq}`;
          const block = getOrCreateBlock(
            blocks,
            proposalId,
            'proposal',
            '提案',
            item.turnId,
          );
          const summary = readString(payload, 'summary');
          if (summary) {
            block.text = summary;
          }
          block.status = readString(payload, 'status') ?? 'failed';
          mergeBlockMetadata(block, item.turnId, item.payload);
          break;
        }
        case 'plan_updated': {
          const blockId = `plan-state-${item.turnId}`;
          const block = getOrCreateBlock(blocks, blockId, 'plan', 'Plan', item.turnId);
          block.text = readString(payload, 'summary') ?? 'Plan updated';
          block.status = 'completed';
          mergeBlockMetadata(block, item.turnId, item.payload);
          break;
        }
        case 'turn_completed': {
          completeStreamingBlocksForTurn(blocks, item.turnId);
          ensureDerivedProposalBlock(blocks, item.threadId, item.turnId);
          activeTurn = activeTurn?.turnId === item.turnId ? null : activeTurn;
          pendingRequests = pendingRequests.filter((request) => request.turnId !== item.turnId);
          break;
        }
        case 'turn_failed': {
          const code = readString(payload, 'code') ?? 'runtime_error';
          const message = readString(payload, 'message') ?? 'assistant turn failed';
          blocks.push({
            blockId: `error-${item.seq}`,
            kind: 'error',
            title: code,
            text: message,
            status: 'completed',
            metadata: { turnId: item.turnId },
          });
          completeStreamingBlocksForTurn(blocks, item.turnId);
          activeTurn = activeTurn?.turnId === item.turnId ? null : activeTurn;
          pendingRequests = pendingRequests.filter((request) => request.turnId !== item.turnId);
          break;
        }
        case 'turn_cancelled': {
          blocks.push({
            blockId: `notice-${item.seq}`,
            kind: 'system_notice',
            title: '已取消',
            text: '当前 turn 已被取消。',
            status: 'completed',
            metadata: { turnId: item.turnId },
          });
          completeStreamingBlocksForTurn(blocks, item.turnId);
          activeTurn = activeTurn?.turnId === item.turnId ? null : activeTurn;
          pendingRequests = pendingRequests.filter((request) => request.turnId !== item.turnId);
          break;
        }
        default:
          break;
      }

      applied = true;

      return {
        threads: {
          ...state.threads,
          [item.threadId]: {
            blocks,
            activeTurn,
            pendingRequests,
          },
        },
        turnSeqCursor: {
          ...state.turnSeqCursor,
          [turnKey]: item.seq,
        },
      };
    });

    return applied;
  },
}));
