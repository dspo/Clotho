import type {
  AssistantDebugPayload,
  AssistantStatusEventEnvelope,
  AssistantThreadsChangedPayload,
  AssistantTurnStreamEnvelope,
  ThreadSnapshot,
} from '@/types/assistant-runtime';
import { useAssistantComposerStore } from './assistant-composer-store';
import { useAssistantRuntimeStore } from './assistant-runtime-store';
import { useAssistantThreadStore } from './assistant-thread-store';
import { useAssistantTranscriptStore } from './assistant-transcript-store';
import { assistantTurnKey, asRecord, deriveThreadPreview, readString } from './helpers';

function syncThreadSummary(threadId: string) {
  const threadStore = useAssistantThreadStore.getState();
  const transcriptStore = useAssistantTranscriptStore.getState();
  const transcript = transcriptStore.threads[threadId];
  const summary = threadStore.items.find((item) => item.threadId === threadId);

  if (!transcript) {
    return;
  }

  threadStore.patchThread(threadId, {
    title: summary?.title ?? 'New conversation',
    lastMessagePreview: deriveThreadPreview(
      transcript.blocks,
      summary?.title ?? 'New conversation',
    ),
    hasRunningTurn: Boolean(transcript.activeTurn),
    updatedAt: new Date().toISOString(),
  });
}

export const assistantRuntimeAdapter = {
  hydrateThread(snapshot: ThreadSnapshot) {
    useAssistantTranscriptStore.getState().hydrateThread(snapshot);
    useAssistantThreadStore.getState().syncFromSnapshot(snapshot);
    useAssistantRuntimeStore.getState().hydrateThreadConfig(snapshot);
    useAssistantComposerStore.getState().ensureDraft(snapshot.threadId);
  },

  applyStreamItem(item: AssistantTurnStreamEnvelope) {
    const applied = useAssistantTranscriptStore.getState().applyStreamItem(item);
    if (!applied) {
      return false;
    }

    syncThreadSummary(item.threadId);

    const runtimeStore = useAssistantRuntimeStore.getState();
    if (item.kind === 'turn_failed') {
      const payload = asRecord(item.payload);
      runtimeStore.setLastError(readString(payload, 'message') ?? 'Assistant turn failed');
    } else if (item.kind === 'proposal_apply_finished') {
      const payload = asRecord(item.payload);
      if (readString(payload, 'status') === 'failed') {
        runtimeStore.setLastError(readString(payload, 'error') ?? 'Proposal apply failed');
      } else if (readString(payload, 'status') === 'applied') {
        runtimeStore.setLastError(null);
      }
    } else if (
      item.kind === 'turn_completed' ||
      item.kind === 'turn_cancelled'
    ) {
      runtimeStore.setLastError(null);
    }

    if (
      item.kind === 'turn_completed' ||
      item.kind === 'turn_failed' ||
      item.kind === 'turn_cancelled'
    ) {
      runtimeStore.markTurnDetached(item.threadId, item.turnId);
    }

    return true;
  },

  applyStatusEvent(event: AssistantStatusEventEnvelope) {
    const payload = asRecord(event.payload);
    const state = readString(payload, 'state');
    if (state) {
      useAssistantRuntimeStore.getState().setConnectionState(state);
    }
  },

  applyThreadsChangedEvent(_event: AssistantStatusEventEnvelope<AssistantThreadsChangedPayload>) {
    return;
  },

  applyDebugEvent(event: AssistantStatusEventEnvelope<AssistantDebugPayload>) {
    const payload = asRecord(event.payload);
    const message = readString(payload, 'message');
    if (message) {
      useAssistantRuntimeStore.getState().noteDebug(message);
    }
  },

  attachTurn(threadId: string, turnId: string) {
    useAssistantRuntimeStore.getState().markTurnAttached(threadId, turnId);
  },

  markTurnResuming(threadId: string, turnId: string, resuming: boolean) {
    useAssistantRuntimeStore.getState().markTurnResuming(threadId, turnId, resuming);
  },

  isTurnAttached(threadId: string, turnId: string) {
    const key = assistantTurnKey(threadId, turnId);
    return Boolean(useAssistantRuntimeStore.getState().attachedTurnKeys[key]);
  },

  isTurnResuming(threadId: string, turnId: string) {
    const key = assistantTurnKey(threadId, turnId);
    return Boolean(useAssistantRuntimeStore.getState().resumingTurnKeys[key]);
  },
};
