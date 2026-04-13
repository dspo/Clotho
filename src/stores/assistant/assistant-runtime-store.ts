import { create } from 'zustand';
import type {
  ConfigFileCandidate,
  ConfigSelection,
  ResolvedConfig,
  RuntimeCatalog,
  ThreadSnapshot,
} from '@/types/assistant-runtime';
import { assistantTurnKey, buildConfigSelection } from './helpers';

interface AssistantRuntimeState {
  connectionState: string;
  lastError: string | null;
  debugMessages: string[];
  configFiles: ConfigFileCandidate[];
  configFilesLoading: boolean;
  configResolving: boolean;
  runtimeCatalog: RuntimeCatalog | null;
  runtimeCatalogLoading: boolean;
  defaultConfigSelection: ConfigSelection | null;
  defaultResolvedConfig: ResolvedConfig | null;
  threadConfigSelection: Record<string, ConfigSelection | null>;
  threadResolvedConfig: Record<string, ResolvedConfig | null>;
  attachedTurnKeys: Record<string, boolean>;
  resumingTurnKeys: Record<string, boolean>;

  setConnectionState: (state: string) => void;
  setLastError: (error: string | null) => void;
  noteDebug: (message: string) => void;
  setConfigFiles: (items: ConfigFileCandidate[]) => void;
  setConfigFilesLoading: (loading: boolean) => void;
  setConfigResolving: (loading: boolean) => void;
  setRuntimeCatalog: (catalog: RuntimeCatalog | null) => void;
  setRuntimeCatalogLoading: (loading: boolean) => void;
  hydrateThreadConfig: (snapshot: ThreadSnapshot) => void;
  setThreadConfig: (
    threadId: string | null,
    selection: ConfigSelection | null,
    resolved: ResolvedConfig | null,
  ) => void;
  markTurnAttached: (threadId: string, turnId: string) => void;
  markTurnDetached: (threadId: string, turnId: string) => void;
  markTurnResuming: (threadId: string, turnId: string, resuming: boolean) => void;
}

export const useAssistantRuntimeStore = create<AssistantRuntimeState>()((set) => ({
  connectionState: 'unknown',
  lastError: null,
  debugMessages: [],
  configFiles: [],
  configFilesLoading: false,
  configResolving: false,
  runtimeCatalog: null,
  runtimeCatalogLoading: false,
  defaultConfigSelection: null,
  defaultResolvedConfig: null,
  threadConfigSelection: {},
  threadResolvedConfig: {},
  attachedTurnKeys: {},
  resumingTurnKeys: {},

  setConnectionState: (connectionState) => set({ connectionState }),

  setLastError: (lastError) => set({ lastError }),

  noteDebug: (message) =>
    set((state) => ({
      debugMessages: [message, ...state.debugMessages].slice(0, 50),
    })),

  setConfigFiles: (configFiles) => set({ configFiles }),

  setConfigFilesLoading: (configFilesLoading) => set({ configFilesLoading }),

  setConfigResolving: (configResolving) => set({ configResolving }),

  setRuntimeCatalog: (runtimeCatalog) => set({ runtimeCatalog }),

  setRuntimeCatalogLoading: (runtimeCatalogLoading) => set({ runtimeCatalogLoading }),

  hydrateThreadConfig: (snapshot) =>
    set((state) => ({
      threadConfigSelection: {
        ...state.threadConfigSelection,
        [snapshot.threadId]: buildConfigSelection(snapshot.configContext),
      },
      threadResolvedConfig: {
        ...state.threadResolvedConfig,
        [snapshot.threadId]: snapshot.configContext,
      },
    })),

  setThreadConfig: (threadId, selection, resolved) =>
    set((state) => {
      if (!threadId) {
        return {
          defaultConfigSelection: selection,
          defaultResolvedConfig: resolved,
        };
      }

      return {
        threadConfigSelection: {
          ...state.threadConfigSelection,
          [threadId]: selection,
        },
        threadResolvedConfig: {
          ...state.threadResolvedConfig,
          [threadId]: resolved,
        },
      };
    }),

  markTurnAttached: (threadId, turnId) =>
    set((state) => {
      const key = assistantTurnKey(threadId, turnId);
      return {
        attachedTurnKeys: {
          ...state.attachedTurnKeys,
          [key]: true,
        },
        resumingTurnKeys: {
          ...state.resumingTurnKeys,
          [key]: false,
        },
      };
    }),

  markTurnDetached: (threadId, turnId) =>
    set((state) => {
      const key = assistantTurnKey(threadId, turnId);
      return {
        attachedTurnKeys: {
          ...state.attachedTurnKeys,
          [key]: false,
        },
        resumingTurnKeys: {
          ...state.resumingTurnKeys,
          [key]: false,
        },
      };
    }),

  markTurnResuming: (threadId, turnId, resuming) =>
    set((state) => ({
      resumingTurnKeys: {
        ...state.resumingTurnKeys,
        [assistantTurnKey(threadId, turnId)]: resuming,
      },
    })),
}));
