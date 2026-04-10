import { create } from 'zustand';

export type AssistantInspectorTab =
  | 'runtime'
  | 'tools'
  | 'skills'
  | 'integrations';

interface AssistantOverlayState {
  configDrawerOpen: boolean;
  proposalDrawerOpen: boolean;
  proposalDrawerThreadId: string | null;
  proposalDrawerProposalId: string | null;
  toolResultDrawerOpen: boolean;
  toolResultDrawerThreadId: string | null;
  toolResultDrawerBlockId: string | null;
  inspectorDrawerOpen: boolean;
  inspectorTab: AssistantInspectorTab;
  mobileSidebarOpen: boolean;

  setConfigDrawerOpen: (open: boolean) => void;
  openProposalDrawer: (threadId: string, proposalId: string) => void;
  closeProposalDrawer: () => void;
  openToolResultDrawer: (threadId: string, blockId: string) => void;
  closeToolResultDrawer: () => void;
  openInspectorDrawer: (tab?: AssistantInspectorTab) => void;
  setInspectorDrawerOpen: (open: boolean) => void;
  setInspectorTab: (tab: AssistantInspectorTab) => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useAssistantOverlayStore = create<AssistantOverlayState>()((set) => ({
  configDrawerOpen: false,
  proposalDrawerOpen: false,
  proposalDrawerThreadId: null,
  proposalDrawerProposalId: null,
  toolResultDrawerOpen: false,
  toolResultDrawerThreadId: null,
  toolResultDrawerBlockId: null,
  inspectorDrawerOpen: false,
  inspectorTab: 'runtime',
  mobileSidebarOpen: false,

  setConfigDrawerOpen: (open) => set({ configDrawerOpen: open }),
  openProposalDrawer: (proposalDrawerThreadId, proposalDrawerProposalId) =>
    set({
      proposalDrawerOpen: true,
      proposalDrawerThreadId,
      proposalDrawerProposalId,
    }),
  closeProposalDrawer: () =>
    set({
      proposalDrawerOpen: false,
      proposalDrawerThreadId: null,
      proposalDrawerProposalId: null,
    }),
  openToolResultDrawer: (toolResultDrawerThreadId, toolResultDrawerBlockId) =>
    set({
      toolResultDrawerOpen: true,
      toolResultDrawerThreadId,
      toolResultDrawerBlockId,
    }),
  closeToolResultDrawer: () =>
    set({
      toolResultDrawerOpen: false,
      toolResultDrawerThreadId: null,
      toolResultDrawerBlockId: null,
    }),
  openInspectorDrawer: (inspectorTab = 'runtime') =>
    set({
      inspectorDrawerOpen: true,
      inspectorTab,
    }),
  setInspectorDrawerOpen: (open) =>
    set((state) => ({
      inspectorDrawerOpen: open,
      inspectorTab: open ? state.inspectorTab : 'runtime',
    })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
}));
