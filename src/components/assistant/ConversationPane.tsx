import { LoaderCircle, PanelLeft, RotateCcw, Settings2, Wrench } from 'lucide-react';
import type {
  ConversationBlock,
  ProposalPayload,
  ResolvedConfig,
} from '@/types/assistant-runtime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type PendingRuntimeRequestView } from '@/stores/assistant/helpers';
import { TranscriptViewport } from './TranscriptViewport';
import { ComposerBar } from './composer/ComposerBar';

interface ConversationPaneProps {
  threadId: string | null;
  threadTitle: string | null;
  blocks: ConversationBlock[];
  pendingRequests: PendingRuntimeRequestView[];
  connectionState: string;
  isRunning: boolean;
  isSubmitting: boolean;
  canResume: boolean;
  resolvedConfig: ResolvedConfig | null;
  onApplyProposal: (proposal: ProposalPayload) => Promise<void>;
  onOpenProposal: (proposal: ProposalPayload) => void;
  onOpenToolResult: (block: ConversationBlock) => void;
  onOpenSidebar: () => void;
  onOpenConfig: () => void;
  onOpenInspector: () => void;
  onOpenInspectorTab: (tab: 'runtime' | 'tools' | 'skills' | 'integrations') => void;
  onResumeTurn: () => void;
  onSend: () => void;
  onStop: () => void;
  onAttachFiles: (files: FileList) => Promise<void>;
  onResolveRuntimeRequest: (
    request: PendingRuntimeRequestView,
    response: unknown,
  ) => Promise<void>;
}

export function ConversationPane({
  threadId,
  threadTitle,
  blocks,
  pendingRequests,
  connectionState,
  isRunning,
  isSubmitting,
  canResume,
  resolvedConfig,
  onApplyProposal,
  onOpenProposal,
  onOpenToolResult,
  onOpenSidebar,
  onOpenConfig,
  onOpenInspector,
  onOpenInspectorTab,
  onResumeTurn,
  onSend,
  onStop,
  onAttachFiles,
  onResolveRuntimeRequest,
}: ConversationPaneProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl items-start gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onOpenSidebar}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold">
                {threadTitle ?? '助手'}
              </h1>
              {isRunning && <LoaderCircle className="h-4 w-4 animate-spin text-primary" />}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={connectionState === 'connected' ? 'secondary' : 'outline'}>
                {connectionState === 'connected' ? 'Runtime 已连接' : 'Runtime 未连接'}
              </Badge>
              {resolvedConfig?.model && <Badge variant="outline">{resolvedConfig.model}</Badge>}
              {resolvedConfig?.provider && (
                <Badge variant="outline">{resolvedConfig.provider}</Badge>
              )}
              {pendingRequests.length > 0 && (
                <Badge variant="secondary">{pendingRequests.length} 个待处理请求</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canResume && (
              <Button variant="outline" size="sm" onClick={onResumeTurn}>
                <RotateCcw className="h-4 w-4" />
                继续流
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onOpenInspector}>
              <Wrench className="h-4 w-4" />
              检查器
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenConfig}>
              <Settings2 className="h-4 w-4" />
              配置
            </Button>
          </div>
        </div>
      </div>

      <TranscriptViewport
        threadId={threadId}
        blocks={blocks}
        pendingRequests={pendingRequests}
        isRunning={isRunning}
        canResume={canResume}
        onApplyProposal={onApplyProposal}
        onOpenProposal={onOpenProposal}
        onOpenToolResult={onOpenToolResult}
        onResumeTurn={onResumeTurn}
        onResolveRuntimeRequest={onResolveRuntimeRequest}
      />

      <ComposerBar
        threadId={threadId}
        isRunning={isRunning}
        isSubmitting={isSubmitting}
        resolvedConfig={resolvedConfig}
        onSend={onSend}
        onStop={onStop}
        onOpenConfig={onOpenConfig}
        onOpenInspector={onOpenInspectorTab}
        onAttachFiles={onAttachFiles}
      />
    </div>
  );
}
