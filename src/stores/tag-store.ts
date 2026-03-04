import { create } from 'zustand';
import type { Tag, CreateTagInput, UpdateTagInput } from '@/types/tag';
import { tagService } from '@/services/tag-service';

interface TagState {
  tags: Tag[];
  loading: boolean;
  error: string | null;

  fetchTags: () => Promise<void>;
  createTag: (input: CreateTagInput) => Promise<Tag>;
  updateTag: (id: string, input: UpdateTagInput) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
}

export const useTagStore = create<TagState>()((set, get) => ({
  tags: [],
  loading: false,
  error: null,

  fetchTags: async () => {
    set({ loading: true, error: null });
    try {
      const tags = await tagService.list();
      set({ tags, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  createTag: async (input) => {
    const tag = await tagService.create(input);
    await get().fetchTags();
    return tag;
  },

  updateTag: async (id, input) => {
    await tagService.update(id, input);
    await get().fetchTags();
  },

  deleteTag: async (id) => {
    const prev = get().tags;
    set({ tags: prev.filter((t) => t.id !== id) });
    try {
      await tagService.delete(id);
    } catch (err) {
      set({ tags: prev });
      throw err;
    }
  },
}));
