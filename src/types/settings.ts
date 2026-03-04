export type ThemeMode = 'light' | 'dark' | 'system';
export type ViewType = 'board' | 'list' | 'gantt' | 'calendar';
export type Language = 'zh-CN' | 'en-US';

export interface AppSettings {
  theme: ThemeMode;
  sidebar_collapsed: boolean;
  default_view: ViewType;
  language: Language;
}
