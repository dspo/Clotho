import { invoke } from '@tauri-apps/api/core';
import type { Tag, CreateTagInput, UpdateTagInput } from '@/types/tag';

export const tagService = {
  list: () =>
    invoke<Tag[]>('list_tags'),

  create: (input: CreateTagInput) =>
    invoke<Tag>('create_tag', { ...input }),

  update: (id: string, input: UpdateTagInput) =>
    invoke<Tag>('update_tag', { id, ...input } as Record<string, unknown>),

  delete: (id: string) =>
    invoke('delete_tag', { id }),
};
