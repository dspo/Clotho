import { useEffect } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type {
  ConfigSelection,
  ConversationBlock,
  ProposalPayload,
  ResolvedConfig,
  ThreadSummary,
} from '@/types/assistant-runtime';
import { assistantRuntimeClient } from '@/services/assistant-runtime-client';
import {
  DEFAULT_ASSISTANT_COMPOSER_DRAFT,
  useAssistantComposerStore,
} from '@/stores/assistant/assistant-composer-store';
import {
  type AssistantInspectorTab,
  useAssistantOverlayStore,
} from '@/stores/assistant/assistant-overlay-store';
import { assistantRuntimeAdapter } from '@/stores/assistant/assistant-runtime-adapter';
import { useAssistantRuntimeStore } from '@/stores/assistant/assistant-runtime-store';
import { useAssistantThreadStore } from '@/stores/assistant/assistant-thread-store';
import { useAssistantTranscriptStore } from '@/stores/assistant/assistant-transcript-store';
import {
  assistantTurnKey,
  getProposalPayload,
  type PendingRuntimeRequestView,
} from '@/stores/assistant/helpers';
import { ThreadSidebar } from './ThreadSidebar';
import { ConversationPane } from './ConversationPane';
import { ConfigDrawer } from './overlays/ConfigDrawer';
import { InspectorDrawer } from './overlays/InspectorDrawer';
import { ProposalDrawer } from './overlays/ProposalDrawer';
import { ToolResultDrawer } from './overlays/ToolResultDrawer';

const EMPTY_TRANSCRIPT = {
  blocks: [],
  activeTurn: null,
  pendingRequests: [],
};

async function refreshThreadList() {
  const threadStore = useAssistantThreadStore.getState();
  threadStore.setLoading(true);
  try {
    const response = await assistantRuntimeClient.listThreads();
    threadStore.setThreadList(response);
    return response.items;
  } catch (error) {
    threadStore.setLoading(false);
    useAssistantRuntimeStore
      .getState()
      .setLastError(String(error));
    throw error;
  }
}

async function resumeTurnStream(threadId: string, turnId: string, afterSeq?: number | null) {
  if (
    assistantRuntimeAdapter.isTurnAttached(threadId, turnId) ||
    assistantRuntimeAdapter.isTurnResuming(threadId, turnId)
  ) {
    return;
  }

  assistantRuntimeAdapter.markTurnResuming(threadId, turnId, true);

  try {
    const ack = await assistantRuntimeClient.resumeTurnStream(
      {
        threadId,
        turnId,
        afterSeq,
      },
      (item) => {
        assistantRuntimeAdapter.applyStreamItem(item);
      },
    );

    if (ack.resumed) {
      assistantRuntimeAdapter.attachTurn(threadId, turnId);
    } else {
      useAssistantRuntimeStore.getState().markTurnDetached(threadId, turnId);
    }
  } catch (error) {
    useAssistantRuntimeStore.getState().setLastError(String(error));
    toast.error('恢复流式输出失败');
  } finally {
    assistantRuntimeAdapter.markTurnResuming(threadId, turnId, false);
  }
}

async function hydrateThread(threadId: string) {
  const snapshot = await assistantRuntimeClient.getThreadSnapshot(threadId);
  assistantRuntimeAdapter.hydrateThread(snapshot);
  if (snapshot.activeTurn) {
    await resumeTurnStream(
      snapshot.threadId,
      snapshot.activeTurn.turnId,
      snapshot.activeTurn.lastSeq,
    );
  }
  return snapshot;
}

async function loadConfigFiles() {
  const runtimeStore = useAssistantRuntimeStore.getState();
  runtimeStore.setConfigFilesLoading(true);
  try {
    const response = await assistantRuntimeClient.listConfigFiles();
    runtimeStore.setConfigFiles(response.items);
  } catch (error) {
    runtimeStore.setLastError(String(error));
    toast.error('读取 Codex 配置文件列表失败');
  } finally {
    runtimeStore.setConfigFilesLoading(false);
  }
}

function currentConfigContext(threadId: string | null) {
  const runtimeStore = useAssistantRuntimeStore.getState();
  if (!threadId) {
    return {
      selection: runtimeStore.defaultConfigSelection,
      resolved: runtimeStore.defaultResolvedConfig,
    };
  }

  return {
    selection:
      runtimeStore.threadConfigSelection[threadId] ?? runtimeStore.defaultConfigSelection,
    resolved:
      runtimeStore.threadResolvedConfig[threadId] ?? runtimeStore.defaultResolvedConfig,
  };
}

export function AssistantShell() {
  const threads = useAssistantThreadStore((state) => state.items);
  const activeThreadId = useAssistantThreadStore((state) => state.activeThreadId);
  const setActiveThread = useAssistantThreadStore((state) => state.setActiveThread);
  const transcript = useAssistantTranscriptStore(
    (state) => (activeThreadId ? state.threads[activeThreadId] ?? EMPTY_TRANSCRIPT : EMPTY_TRANSCRIPT),
  );
  const isSubmitting = useAssistantComposerStore((state) => state.isSubmitting);
  const overlayState = useAssistantOverlayStore(
    useShallow((state) => ({
      configDrawerOpen: state.configDrawerOpen,
      proposalDrawerOpen: state.proposalDrawerOpen,
      proposalDrawerThreadId: state.proposalDrawerThreadId,
      proposalDrawerProposalId: state.proposalDrawerProposalId,
      toolResultDrawerOpen: state.toolResultDrawerOpen,
      toolResultDrawerThreadId: state.toolResultDrawerThreadId,
      toolResultDrawerBlockId: state.toolResultDrawerBlockId,
      inspectorDrawerOpen: state.inspectorDrawerOpen,
      inspectorTab: state.inspectorTab,
      mobileSidebarOpen: state.mobileSidebarOpen,
    })),
  );
  const setConfigDrawerOpen = useAssistantOverlayStore((state) => state.setConfigDrawerOpen);
  const openProposalDrawer = useAssistantOverlayStore((state) => state.openProposalDrawer);
  const closeProposalDrawer = useAssistantOverlayStore((state) => state.closeProposalDrawer);
  const openToolResultDrawer = useAssistantOverlayStore((state) => state.openToolResultDrawer);
  const closeToolResultDrawer = useAssistantOverlayStore((state) => state.closeToolResultDrawer);
  const openInspectorDrawer = useAssistantOverlayStore((state) => state.openInspectorDrawer);
  const setInspectorDrawerOpen = useAssistantOverlayStore((state) => state.setInspectorDrawerOpen);
  const setInspectorTab = useAssistantOverlayStore((state) => state.setInspectorTab);
  const setMobileSidebarOpen = useAssistantOverlayStore((state) => state.setMobileSidebarOpen);
  const runtimeState = useAssistantRuntimeStore(
    useShallow((state) => ({
      connectionState: state.connectionState,
      configFiles: state.configFiles,
      configFilesLoading: state.configFilesLoading,
      configResolving: state.configResolving,
      runtimeCatalog: state.runtimeCatalog,
      runtimeCatalogLoading: state.runtimeCatalogLoading,
      threadConfigSelection: state.threadConfigSelection,
      threadResolvedConfig: state.threadResolvedConfig,
      defaultConfigSelection: state.defaultConfigSelection,
      defaultResolvedConfig: state.defaultResolvedConfig,
      attachedTurnKeys: state.attachedTurnKeys,
      resumingTurnKeys: state.resumingTurnKeys,
      debugMessages: state.debugMessages,
    })),
  );

  const activeThreadSummary = threads.find((thread) => thread.threadId === activeThreadId) ?? null;
  const activeTurnKey = transcript.activeTurn
    ? assistantTurnKey(activeThreadId ?? '', transcript.activeTurn.turnId)
    : null;
  const canResume = Boolean(
    transcript.activeTurn &&
      activeThreadId &&
      !runtimeState.attachedTurnKeys[activeTurnKey ?? ''] &&
      !runtimeState.resumingTurnKeys[activeTurnKey ?? ''],
  );
  const proposalDrawerBlock =
    overlayState.proposalDrawerOpen &&
    activeThreadId &&
    overlayState.proposalDrawerThreadId === activeThreadId
      ? transcript.blocks.find(
          (block) =>
            block.kind === 'proposal' &&
            block.blockId === overlayState.proposalDrawerProposalId,
        ) ?? null
      : null;
  const selectedProposal = proposalDrawerBlock
    ? getProposalPayload(proposalDrawerBlock)
    : null;
  const toolResultBlock =
    overlayState.toolResultDrawerOpen &&
    activeThreadId &&
    overlayState.toolResultDrawerThreadId === activeThreadId
      ? transcript.blocks.find(
          (block) =>
            block.kind === 'tool_call' &&
            block.blockId === overlayState.toolResultDrawerBlockId,
        ) ?? null
      : null;
  const resolvedConfig = activeThreadId
    ? runtimeState.threadResolvedConfig[activeThreadId] ?? runtimeState.defaultResolvedConfig
    : runtimeState.defaultResolvedConfig;
  const configSelection = activeThreadId
    ? runtimeState.threadConfigSelection[activeThreadId] ?? runtimeState.defaultConfigSelection
    : runtimeState.defaultConfigSelection;

  useEffect(() => {
    let mounted = true;
    let unlistenStatus: (() => void) | null = null;
    let unlistenThreads: (() => void) | null = null;
    let unlistenDebug: (() => void) | null = null;

    async function bootstrap() {
      try {
        const [status, threadsChanged, debug] = await Promise.all([
          assistantRuntimeClient.onStatus((event) => {
            assistantRuntimeAdapter.applyStatusEvent(event);
          }),
          assistantRuntimeClient.onThreadsChanged((event) => {
            assistantRuntimeAdapter.applyThreadsChangedEvent(event);
            void refreshThreadList().catch(() => {
              toast.error('刷新 thread 列表失败');
            });
          }),
          assistantRuntimeClient.onDebug((event) => {
            assistantRuntimeAdapter.applyDebugEvent(event);
          }),
        ]);

        if (!mounted) {
          status();
          threadsChanged();
          debug();
          return;
        }

        unlistenStatus = status;
        unlistenThreads = threadsChanged;
        unlistenDebug = debug;

        await refreshThreadList();
      } catch (error) {
        useAssistantRuntimeStore.getState().setLastError(String(error));
        toast.error('初始化 assistant runtime 失败');
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
      unlistenStatus?.();
      unlistenThreads?.();
      unlistenDebug?.();
    };
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }

    void hydrateThread(activeThreadId).catch((error) => {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('加载 thread 失败');
    });
  }, [activeThreadId]);

  async function createThread(
    selection?: ConfigSelection | null,
    resolved?: ResolvedConfig | null,
  ) {
    const threadStore = useAssistantThreadStore.getState();
    const runtimeStore = useAssistantRuntimeStore.getState();
    const nextSelection = selection ?? runtimeStore.defaultConfigSelection;
    const nextResolved = resolved ?? runtimeStore.defaultResolvedConfig;

    const response = await assistantRuntimeClient.createThread(
      nextSelection ? { configContext: nextSelection } : undefined,
    );

    const summary: ThreadSummary = {
      threadId: response.threadId,
      title: response.title,
      lastMessagePreview: response.title,
      updatedAt: new Date().toISOString(),
      hasRunningTurn: false,
    };

    threadStore.upsertThread(summary);
    threadStore.setActiveThread(response.threadId);
    useAssistantTranscriptStore.getState().clearThread(response.threadId);
    useAssistantRuntimeStore
      .getState()
      .setThreadConfig(response.threadId, nextSelection ?? null, nextResolved ?? null);

    return response.threadId;
  }

  async function handleCreateThread() {
    try {
      await createThread(configSelection, resolvedConfig);
      setMobileSidebarOpen(false);
      await refreshThreadList();
    } catch (error) {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('创建 thread 失败');
    }
  }

  async function handleSend() {
    const composerStore = useAssistantComposerStore.getState();
    const existingThreadId = activeThreadId;
    const currentDraft =
      composerStore.drafts[activeThreadId ?? '__draft__'] ?? DEFAULT_ASSISTANT_COMPOSER_DRAFT;
    const text = currentDraft.text.trim();

    if (!text) {
      return;
    }

    composerStore.setSubmitting(true);

    let threadId = existingThreadId;
    try {
      if (!threadId) {
        threadId = await createThread();
      } else {
        useAssistantTranscriptStore.getState().appendOptimisticUserMessage(threadId, text);
      }

      const config = currentConfigContext(threadId);
      const ack = await assistantRuntimeClient.startTurn(
        {
          threadId,
          text,
          mode: currentDraft.mode,
          attachments: currentDraft.attachments,
          modelOverride: currentDraft.modelOverride.trim() || null,
          configContext: config.selection ?? null,
        },
        (item) => {
          assistantRuntimeAdapter.applyStreamItem(item);
        },
      );

      assistantRuntimeAdapter.attachTurn(ack.threadId, ack.turnId);
      useAssistantTranscriptStore
        .getState()
        .setActiveTurn(ack.threadId, ack.turnId, ack.acceptedAt);
      if (!existingThreadId) {
        composerStore.clearDraft(null);
      }
      composerStore.clearDraft(threadId);
      await Promise.allSettled([hydrateThread(threadId), refreshThreadList()]);
    } catch (error) {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('发送 turn 失败');
      if (threadId) {
        await Promise.allSettled([hydrateThread(threadId), refreshThreadList()]);
      }
    } finally {
      composerStore.setSubmitting(false);
    }
  }

  async function handleStop() {
    if (!activeThreadId || !transcript.activeTurn) {
      return;
    }

    try {
      await assistantRuntimeClient.cancelTurn({
        threadId: activeThreadId,
        turnId: transcript.activeTurn.turnId,
      });
    } catch (error) {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('停止当前 turn 失败');
    }
  }

  async function handleResumeTurn() {
    if (!activeThreadId || !transcript.activeTurn) {
      return;
    }

    await resumeTurnStream(
      activeThreadId,
      transcript.activeTurn.turnId,
      transcript.activeTurn.lastSeq,
    );
  }

  async function handleResolveRuntimeRequest(
    request: PendingRuntimeRequestView,
    response: unknown,
  ) {
    if (!activeThreadId || !request.turnId) {
      toast.error('无法定位 runtime request 所属 turn');
      return;
    }

    try {
      await assistantRuntimeClient.submitRuntimeRequest({
        threadId: activeThreadId,
        turnId: request.turnId,
        requestId: request.requestId,
        response,
      });
    } catch (error) {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('提交 runtime request 响应失败');
      throw error;
    }
  }

  async function ensureRuntimeCatalog(force = false) {
    const runtimeStore = useAssistantRuntimeStore.getState();
    if (!force && runtimeStore.runtimeCatalog) {
      return runtimeStore.runtimeCatalog;
    }

    runtimeStore.setRuntimeCatalogLoading(true);
    try {
      const catalog = await assistantRuntimeClient.getRuntimeCatalog();
      runtimeStore.setRuntimeCatalog(catalog);
      return catalog;
    } catch (error) {
      runtimeStore.setLastError(String(error));
      toast.error('读取 Assistant inspector 数据失败');
      throw error;
    } finally {
      runtimeStore.setRuntimeCatalogLoading(false);
    }
  }

  async function handleOpenConfigDrawer() {
    setConfigDrawerOpen(true);
    if (runtimeState.configFiles.length === 0) {
      await loadConfigFiles();
    }
  }

  async function handleApplyConfig(configFilePath: string, profile: string | null) {
    const runtimeStore = useAssistantRuntimeStore.getState();
    runtimeStore.setConfigResolving(true);

    try {
      const resolved = await assistantRuntimeClient.resolveConfigProfile({
        configFilePath,
        profile,
      });
      runtimeStore.setThreadConfig(
        activeThreadId,
        {
          configFilePath,
          profile,
        },
        resolved,
      );
      setConfigDrawerOpen(false);
      toast.success('Codex 配置已更新');
    } catch (error) {
      runtimeStore.setLastError(String(error));
      toast.error('解析 Codex 配置失败');
      throw error;
    } finally {
      runtimeStore.setConfigResolving(false);
    }
  }

  async function handleCreateThreadWithConfig(
    configFilePath: string,
    profile: string | null,
  ) {
    try {
      const runtimeStore = useAssistantRuntimeStore.getState();
      runtimeStore.setConfigResolving(true);
      const nextResolved = await assistantRuntimeClient.resolveConfigProfile({
        configFilePath,
        profile,
      });
      const nextSelection = {
        configFilePath,
        profile,
      };
      const threadId = await createThread(nextSelection, nextResolved);
      setConfigDrawerOpen(false);
      await Promise.allSettled([hydrateThread(threadId), refreshThreadList()]);
    } catch (error) {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('使用当前配置创建 thread 失败');
    } finally {
      useAssistantRuntimeStore.getState().setConfigResolving(false);
    }
  }

  function handleOpenProposal(proposal: ProposalPayload) {
    openProposalDrawer(proposal.thread_id, proposal.proposal_id);
  }

  function handleOpenToolResult(block: ConversationBlock) {
    if (!activeThreadId) {
      return;
    }
    openToolResultDrawer(activeThreadId, block.blockId);
  }

  async function handleOpenInspector(tab: AssistantInspectorTab) {
    openInspectorDrawer(tab);
    setInspectorTab(tab);
    await ensureRuntimeCatalog();
  }

  async function handleAttachFiles(files: FileList) {
    try {
      const attachments = [];
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        const response = await assistantRuntimeClient.stageLocalImage({
          filename: file.name,
          mimeType: file.type || null,
          data: Array.from(new Uint8Array(buffer)),
        });
        attachments.push(response.attachment);
      }

      if (attachments.length > 0) {
        useAssistantComposerStore
          .getState()
          .addAttachments(activeThreadId, attachments);
        toast.success(`已添加 ${attachments.length} 个图片附件`);
      }
    } catch (error) {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('添加图片附件失败');
    }
  }

  async function handleApplyProposal(proposal: ProposalPayload) {
    try {
      await assistantRuntimeClient.applyProposal({
        threadId: proposal.thread_id,
        turnId: proposal.turn_id,
        proposalId: proposal.proposal_id,
        proposal,
      });
      toast.success('提案已应用');
    } catch (error) {
      useAssistantRuntimeStore.getState().setLastError(String(error));
      toast.error('应用提案失败');
      throw error;
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-background">
      <ThreadSidebar
        open={overlayState.mobileSidebarOpen}
        connectionState={runtimeState.connectionState}
        threads={threads}
        activeThreadId={activeThreadId}
        onCreateThread={() => void handleCreateThread()}
        onSelectThread={setActiveThread}
        onOpenChange={setMobileSidebarOpen}
      />

      <ConversationPane
        threadId={activeThreadId}
        threadTitle={activeThreadSummary?.title ?? null}
        blocks={transcript.blocks}
        pendingRequests={transcript.pendingRequests}
        connectionState={runtimeState.connectionState}
        isRunning={Boolean(transcript.activeTurn)}
        isSubmitting={isSubmitting}
        canResume={canResume}
        resolvedConfig={resolvedConfig}
        onApplyProposal={handleApplyProposal}
        onOpenProposal={handleOpenProposal}
        onOpenToolResult={handleOpenToolResult}
        onOpenSidebar={() => setMobileSidebarOpen(true)}
        onOpenConfig={() => void handleOpenConfigDrawer()}
        onOpenInspector={() => void handleOpenInspector('runtime')}
        onOpenInspectorTab={(tab) => void handleOpenInspector(tab)}
        onResumeTurn={() => void handleResumeTurn()}
        onSend={() => void handleSend()}
        onStop={() => void handleStop()}
        onAttachFiles={(files) => handleAttachFiles(files)}
        onResolveRuntimeRequest={handleResolveRuntimeRequest}
      />

      <ConfigDrawer
        open={overlayState.configDrawerOpen}
        threadTitle={activeThreadSummary?.title ?? null}
        selection={configSelection}
        resolvedConfig={resolvedConfig}
        configFiles={runtimeState.configFiles}
        loading={runtimeState.configFilesLoading}
        resolving={runtimeState.configResolving}
        onOpenChange={setConfigDrawerOpen}
        onRefreshConfigFiles={() => void loadConfigFiles()}
        onApply={handleApplyConfig}
        onCreateThreadWithConfig={handleCreateThreadWithConfig}
      />

      <ProposalDrawer
        open={overlayState.proposalDrawerOpen}
        proposal={selectedProposal}
        status={proposalDrawerBlock?.status ?? null}
        onOpenChange={(open) => {
          if (!open) {
            closeProposalDrawer();
          }
        }}
        onApply={handleApplyProposal}
      />

      <ToolResultDrawer
        open={overlayState.toolResultDrawerOpen}
        block={toolResultBlock}
        onOpenChange={(open) => {
          if (!open) {
            closeToolResultDrawer();
          }
        }}
      />

      <InspectorDrawer
        open={overlayState.inspectorDrawerOpen}
        tab={overlayState.inspectorTab}
        catalog={runtimeState.runtimeCatalog}
        loading={runtimeState.runtimeCatalogLoading}
        connectionState={runtimeState.connectionState}
        resolvedConfig={resolvedConfig}
        debugMessages={runtimeState.debugMessages}
        onOpenChange={setInspectorDrawerOpen}
        onTabChange={setInspectorTab}
        onRefresh={() => void ensureRuntimeCatalog(true)}
      />
    </div>
  );
}
