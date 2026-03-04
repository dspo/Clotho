import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '@/types/settings';

export const settingsService = {
  get: () =>
    invoke<AppSettings>('get_settings'),

  update: (settings: Partial<AppSettings>) =>
    invoke<AppSettings>('update_settings', { settings }),
};
