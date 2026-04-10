import { create } from 'zustand';
import type { AttachmentRef, StartTurnRequest } from '@/types/assistant-runtime';

export type AssistantComposerMode = StartTurnRequest['mode'];

export interface AssistantComposerDraft {
  text: string;
  mode: AssistantComposerMode;
  modelOverride: string;
  attachments: AttachmentRef[];
}

const DEFAULT_THREAD_KEY = '__draft__';

export const DEFAULT_ASSISTANT_COMPOSER_DRAFT: AssistantComposerDraft = {
  text: '',
  mode: 'default',
  modelOverride: '',
  attachments: [],
};

interface AssistantComposerState {
  drafts: Record<string, AssistantComposerDraft>;
  isSubmitting: boolean;

  ensureDraft: (threadId?: string | null) => void;
  setText: (threadId: string | null | undefined, text: string) => void;
  setMode: (threadId: string | null | undefined, mode: AssistantComposerMode) => void;
  setModelOverride: (threadId: string | null | undefined, modelOverride: string) => void;
  addAttachments: (
    threadId: string | null | undefined,
    attachments: AttachmentRef[],
  ) => void;
  removeAttachment: (
    threadId: string | null | undefined,
    attachmentPath: string,
  ) => void;
  clearDraft: (threadId: string | null | undefined) => void;
  setSubmitting: (isSubmitting: boolean) => void;
}

function draftKey(threadId?: string | null) {
  return threadId ?? DEFAULT_THREAD_KEY;
}

function currentDraft(
  drafts: Record<string, AssistantComposerDraft>,
  threadId?: string | null,
) {
  return drafts[draftKey(threadId)] ?? DEFAULT_ASSISTANT_COMPOSER_DRAFT;
}

export const useAssistantComposerStore = create<AssistantComposerState>()((set) => ({
  drafts: {},
  isSubmitting: false,

  ensureDraft: (threadId) =>
    set((state) => {
      const key = draftKey(threadId);
      if (state.drafts[key]) {
        return state;
      }

      return {
        drafts: {
          ...state.drafts,
          [key]: DEFAULT_ASSISTANT_COMPOSER_DRAFT,
        },
      };
    }),

  setText: (threadId, text) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [draftKey(threadId)]: {
          ...currentDraft(state.drafts, threadId),
          text,
        },
      },
    })),

  setMode: (threadId, mode) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [draftKey(threadId)]: {
          ...currentDraft(state.drafts, threadId),
          mode,
        },
      },
    })),

  setModelOverride: (threadId, modelOverride) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [draftKey(threadId)]: {
          ...currentDraft(state.drafts, threadId),
          modelOverride,
        },
      },
    })),

  addAttachments: (threadId, attachments) =>
    set((state) => {
      const draft = currentDraft(state.drafts, threadId);
      const existing = new Set(
        draft.attachments
          .map((attachment) => attachment.path ?? attachment.id ?? attachment.name ?? '')
          .filter((value) => value.length > 0),
      );
      const merged = [
        ...draft.attachments,
        ...attachments.filter((attachment) => {
          const key = attachment.path ?? attachment.id ?? attachment.name ?? '';
          return key.length > 0 && !existing.has(key);
        }),
      ];

      return {
        drafts: {
          ...state.drafts,
          [draftKey(threadId)]: {
            ...draft,
            attachments: merged,
          },
        },
      };
    }),

  removeAttachment: (threadId, attachmentPath) =>
    set((state) => {
      const draft = currentDraft(state.drafts, threadId);
      return {
        drafts: {
          ...state.drafts,
          [draftKey(threadId)]: {
            ...draft,
            attachments: draft.attachments.filter(
              (attachment) => attachment.path !== attachmentPath,
            ),
          },
        },
      };
    }),

  clearDraft: (threadId) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [draftKey(threadId)]: DEFAULT_ASSISTANT_COMPOSER_DRAFT,
      },
    })),

  setSubmitting: (isSubmitting) => set({ isSubmitting }),
}));
