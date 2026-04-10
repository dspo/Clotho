import { create } from 'zustand';
import type {
  ListThreadsResponse,
  ThreadSnapshot,
  ThreadSummary,
} from '@/types/assistant-runtime';
import { deriveThreadPreview } from './helpers';

interface AssistantThreadState {
  items: ThreadSummary[];
  nextCursor: string | null;
  activeThreadId: string | null;
  loading: boolean;
  initialized: boolean;

  setLoading: (loading: boolean) => void;
  setThreadList: (response: ListThreadsResponse) => void;
  upsertThread: (thread: ThreadSummary) => void;
  patchThread: (
    threadId: string,
    patch: Partial<ThreadSummary> & Pick<ThreadSummary, 'title'>,
  ) => void;
  setActiveThread: (threadId: string | null) => void;
  syncFromSnapshot: (snapshot: ThreadSnapshot) => void;
}

function mergeThread(
  items: ThreadSummary[],
  nextThread: ThreadSummary,
): ThreadSummary[] {
  const currentIndex = items.findIndex((item) => item.threadId === nextThread.threadId);
  if (currentIndex === -1) {
    return [nextThread, ...items];
  }

  const nextItems = [...items];
  nextItems[currentIndex] = nextThread;
  return nextItems;
}

export const useAssistantThreadStore = create<AssistantThreadState>()((set) => ({
  items: [],
  nextCursor: null,
  activeThreadId: null,
  loading: false,
  initialized: false,

  setLoading: (loading) => set({ loading }),

  setThreadList: ({ items, nextCursor }) =>
    set((state) => {
      const activeExists = state.activeThreadId
        ? items.some((item) => item.threadId === state.activeThreadId)
        : false;

      return {
        items,
        nextCursor,
        loading: false,
        initialized: true,
        activeThreadId: activeExists ? state.activeThreadId : items[0]?.threadId ?? null,
      };
    }),

  upsertThread: (thread) =>
    set((state) => ({
      items: mergeThread(state.items, thread),
      activeThreadId: state.activeThreadId ?? thread.threadId,
    })),

  patchThread: (threadId, patch) =>
    set((state) => {
      const existing = state.items.find((item) => item.threadId === threadId);
      const nextThread: ThreadSummary = existing
        ? { ...existing, ...patch }
        : {
            threadId,
            title: patch.title,
            lastMessagePreview: patch.lastMessagePreview ?? patch.title,
            updatedAt: patch.updatedAt ?? new Date().toISOString(),
            hasRunningTurn: patch.hasRunningTurn ?? false,
          };

      return {
        items: mergeThread(state.items, nextThread),
        activeThreadId: state.activeThreadId ?? threadId,
      };
    }),

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),

  syncFromSnapshot: (snapshot) =>
    set((state) => {
      const existing = state.items.find((item) => item.threadId === snapshot.threadId);
      const nextThread: ThreadSummary = {
        threadId: snapshot.threadId,
        title: snapshot.title,
        lastMessagePreview: deriveThreadPreview(snapshot.blocks, snapshot.title),
        updatedAt: existing?.updatedAt ?? new Date().toISOString(),
        hasRunningTurn: Boolean(snapshot.activeTurn),
      };

      return {
        items: mergeThread(state.items, nextThread),
        activeThreadId: state.activeThreadId ?? snapshot.threadId,
      };
    }),
}));
