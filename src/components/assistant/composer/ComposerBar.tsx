import { useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Paperclip,
  SendHorizonal,
  Settings2,
  Square,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DEFAULT_ASSISTANT_COMPOSER_DRAFT,
  useAssistantComposerStore,
} from '@/stores/assistant/assistant-composer-store';
import type {
  ResolvedConfig,
} from '@/types/assistant-runtime';
import { ModelSelector } from './ModelSelector';
import { SlashMenu, type SlashMenuItem } from './SlashMenu';

type InspectorTab = 'runtime' | 'tools' | 'skills' | 'integrations';

interface ComposerBarProps {
  threadId: string | null;
  isRunning: boolean;
  isSubmitting: boolean;
  resolvedConfig: ResolvedConfig | null;
  onSend: () => void;
  onStop: () => void;
  onOpenConfig: () => void;
  onOpenInspector: (tab: InspectorTab) => void;
  onAttachFiles: (files: FileList) => Promise<void>;
}

export function ComposerBar({
  threadId,
  isRunning,
  isSubmitting,
  resolvedConfig,
  onSend,
  onStop,
  onOpenConfig,
  onOpenInspector,
  onAttachFiles,
}: ComposerBarProps) {
  const [slashOpen, setSlashOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draft = useAssistantComposerStore(
    (state) => state.drafts[threadId ?? '__draft__'] ?? DEFAULT_ASSISTANT_COMPOSER_DRAFT,
  );
  const setText = useAssistantComposerStore((state) => state.setText);
  const setMode = useAssistantComposerStore((state) => state.setMode);
  const setModelOverride = useAssistantComposerStore((state) => state.setModelOverride);
  const removeAttachment = useAssistantComposerStore((state) => state.removeAttachment);

  const submitDisabled = !draft.text.trim() || isSubmitting || isRunning;
  const slashItems = useMemo<SlashMenuItem[]>(
    () => [
      {
        id: 'plan',
        group: 'Mode',
        label: 'Plan 模式',
        description: '偏重分析、排期、拆解和 proposal 规划。',
        shortcut: '/plan',
      },
      {
        id: 'default',
        group: 'Mode',
        label: 'Default 模式',
        description: '偏重执行、读取上下文与调用工具。',
        shortcut: '/default',
      },
      {
        id: 'attach',
        group: 'Composer',
        label: '添加图片附件',
        description: '把本地图片作为 local image 附件发给 Agent。',
        shortcut: '/attach',
      },
      {
        id: 'config',
        group: 'Composer',
        label: '打开配置抽屉',
        description: '切换 `.codex/config.toml` 上下文和 profile。',
        shortcut: '/config',
      },
      {
        id: 'model-default',
        group: 'Composer',
        label: '模型跟随配置默认值',
        description: '清空当前 turn 的模型覆盖。',
        shortcut: '/model',
      },
      {
        id: 'model:gpt-5.4',
        group: 'Composer',
        label: '切到 gpt-5.4',
        description: '使用 gpt-5.4 作为本 turn 模型覆盖。',
      },
      {
        id: 'model:gpt-5',
        group: 'Composer',
        label: '切到 gpt-5',
        description: '使用 gpt-5 作为本 turn 模型覆盖。',
      },
      {
        id: 'model:gpt-5-mini',
        group: 'Composer',
        label: '切到 gpt-5-mini',
        description: '使用 gpt-5-mini 作为本 turn 模型覆盖。',
      },
      {
        id: 'runtime',
        group: 'Inspectors',
        label: '打开 Runtime Inspector',
        description: '查看 runtime 连接状态、配置摘要和 debug 消息。',
        shortcut: '/runtime',
      },
      {
        id: 'tools',
        group: 'Inspectors',
        label: '打开 Tools Inspector',
        description: '查看当前内置 native function tools 列表。',
        shortcut: '/tools',
      },
      {
        id: 'skills',
        group: 'Inspectors',
        label: '打开 Skills Inspector',
        description: '查看 repo skills；只用于调试，不作为主工作流入口。',
        shortcut: '/skills',
      },
      {
        id: 'integrations',
        group: 'Inspectors',
        label: '打开 Integrations Inspector',
        description: '查看外部 integrations / MCP 调试信息。',
        shortcut: '/integrations',
      },
    ],
    [],
  );

  async function handleSelectSlashItem(itemId: string) {
    if (itemId === 'plan' || itemId === 'default' || itemId === 'access') {
      setMode(threadId, itemId === 'access' ? 'default' : itemId);
      return;
    }

    if (itemId === 'attach') {
      fileInputRef.current?.click();
      return;
    }

    if (itemId === 'config') {
      onOpenConfig();
      return;
    }

    if (itemId === 'model-default') {
      setModelOverride(threadId, '');
      return;
    }

    if (itemId.startsWith('model:')) {
      setModelOverride(threadId, itemId.replace('model:', ''));
      return;
    }

    onOpenInspector(itemId as InspectorTab);
  }

  return (
    <div className="border-t bg-background/95 px-4 py-4 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <Textarea
          value={draft.text}
          onChange={(event) => setText(threadId, event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }

            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              if (!submitDisabled) {
                onSend();
              }
              return;
            }

            if (
              event.key === '/' &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey &&
              draft.text.trim().length === 0
            ) {
              event.preventDefault();
              setSlashOpen(true);
              return;
            }

            if (event.key === 'Escape' && slashOpen) {
              event.preventDefault();
              setSlashOpen(false);
            }
          }}
          placeholder="直接和 Agent 对话。支持分析任务、拆解目标、调整计划、补全文档。输入 / 打开 slash menu。"
          className="min-h-28 resize-none"
        />

        {draft.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {draft.attachments.map((attachment, index) => {
              const key =
                attachment.path ?? attachment.id ?? attachment.name ?? `attachment-${index}`;
              return (
                <div
                  key={key}
                  className="flex max-w-full items-center gap-2 rounded-full border bg-muted/30 px-3 py-1 text-xs"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate">
                    {attachment.name ?? attachment.path ?? attachment.id ?? 'attachment'}
                  </span>
                  {attachment.path && (
                    <button
                      type="button"
                      className="rounded-full p-0.5 transition-colors hover:bg-muted"
                      onClick={() => removeAttachment(threadId, attachment.path ?? '')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={draft.mode}
              onValueChange={(value) => {
                if (value === 'plan' || value === 'default') {
                  setMode(threadId, value);
                }
              }}
            >
              <ToggleGroupItem value="default">Default</ToggleGroupItem>
              <ToggleGroupItem value="plan">Plan</ToggleGroupItem>
            </ToggleGroup>

            <ModelSelector
              value={draft.modelOverride}
              resolvedModel={resolvedConfig?.model ?? null}
              onChange={(value) => setModelOverride(threadId, value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSlashOpen(true)}
              >
                <AtSign className="h-4 w-4" />
                Slash
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                附件
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenConfig}>
                <Settings2 className="h-4 w-4" />
                配置
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenInspector('runtime')}
              >
                <Wrench className="h-4 w-4" />
                Inspector
              </Button>
            </div>

            <div className="flex items-center justify-end gap-2">
              {isRunning ? (
                <Button variant="destructive" onClick={onStop}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button disabled={submitDisabled} onClick={onSend}>
                  <SendHorizonal className="h-4 w-4" />
                  发送
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {isRunning
              ? '当前 turn 正在运行，可随时停止。'
              : 'Enter 换行，Cmd/Ctrl + Enter 发送，/ 打开 slash menu。'}
          </span>
          <span>
            模型: {draft.modelOverride.trim() || resolvedConfig?.model || '使用配置默认值'}
          </span>
          <span>
            Provider: {resolvedConfig?.provider || '从 Codex 配置推断'}
          </span>
          {draft.attachments.length > 0 && (
            <span>附件: {draft.attachments.length}</span>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            void onAttachFiles(event.target.files);
            event.target.value = '';
          }
        }}
      />

      <SlashMenu
        open={slashOpen}
        items={slashItems}
        onOpenChange={setSlashOpen}
        onSelect={(itemId) => {
          void handleSelectSlashItem(itemId);
        }}
      />
    </div>
  );
}
