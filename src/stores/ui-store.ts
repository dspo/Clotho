import { create } from 'zustand';
import type { ViewType } from '@/types/settings';

export interface PendingListFilter {
  projectId: string;
  unscheduled: boolean;
}

interface UIState {
  sidebarCollapsed: boolean;
  activeView: ViewType;
  detailPanelOpen: boolean;
  detailPanelTaskId: string | null;
  selectedProjectIds: string[];
  pendingListFilter: PendingListFilter | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveView: (view: ViewType) => void;
  openDetailPanel: (taskId: string) => void;
  closeDetailPanel: () => void;
  setSelectedProjectIds: (ids: string[]) => void;
  toggleProjectId: (id: string) => void;
  setPendingListFilter: (filter: PendingListFilter | null) => void;
}

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarCollapsed: false,
  activeView: 'gantt',
  detailPanelOpen: false,
  detailPanelTaskId: null,
  selectedProjectIds: [],
  pendingListFilter: null,

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) =>
    set({ sidebarCollapsed: collapsed }),

  setActiveView: (view) =>
    set({ activeView: view }),

  openDetailPanel: (taskId) =>
    set({ detailPanelOpen: true, detailPanelTaskId: taskId }),

  closeDetailPanel: () =>
    set({ detailPanelOpen: false, detailPanelTaskId: null }),

  setSelectedProjectIds: (ids) =>
    set({ selectedProjectIds: ids }),

  toggleProjectId: (id) => {
    const current = get().selectedProjectIds;
    if (current.includes(id)) {
      set({ selectedProjectIds: current.filter((pid) => pid !== id) });
    } else {
      set({ selectedProjectIds: [...current, id] });
    }
  },

  setPendingListFilter: (filter) => set({ pendingListFilter: filter }),
}));
