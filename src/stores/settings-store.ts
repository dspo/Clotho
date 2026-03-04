import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode, ViewType, Language } from '@/types/settings';

export type GanttDatePreset = 'this_week' | 'this_fortnight' | 'this_month' | null;

interface SettingsState {
  theme: ThemeMode;
  defaultView: ViewType;
  language: Language;
  viewOrder: string[];
  mcpUrl: string;
  mcpEnabled: boolean;
  ganttDatePreset: GanttDatePreset;

  setTheme: (theme: ThemeMode) => void;
  setDefaultView: (view: ViewType) => void;
  setLanguage: (lang: Language) => void;
  setViewOrder: (order: string[]) => void;
  setMcpUrl: (url: string) => void;
  setMcpEnabled: (enabled: boolean) => void;
  setGanttDatePreset: (preset: GanttDatePreset) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      defaultView: 'board',
      language: 'en-US',
      viewOrder: ['board', 'list', 'gantt', 'calendar'],
      mcpUrl: 'http://0.0.0.0:7400/mcp',
      mcpEnabled: false,
      ganttDatePreset: null,

      setTheme: (theme) => set({ theme }),
      setDefaultView: (view) => set({ defaultView: view }),
      setLanguage: (lang) => set({ language: lang }),
      setViewOrder: (order) => set({ viewOrder: order }),
      setMcpUrl: (url) => set({ mcpUrl: url }),
      setMcpEnabled: (enabled) => set({ mcpEnabled: enabled }),
      setGanttDatePreset: (preset) => set({ ganttDatePreset: preset }),
    }),
    {
      name: 'clotho-settings',
    }
  )
);
