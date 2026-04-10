import { useEffect, useRef, useState } from 'react';
import type { ConversationBlock, ProposalPayload } from '@/types/assistant-runtime';
import { Button } from '@/components/ui/button';
import { type PendingRuntimeRequestView } from '@/stores/assistant/helpers';
import { BlockRenderer } from './blocks/BlockRenderer';

interface TranscriptViewportProps {
  threadId: string | null;
  blocks: ConversationBlock[];
  pendingRequests: PendingRuntimeRequestView[];
  isRunning: boolean;
  canResume: boolean;
  onApplyProposal: (proposal: ProposalPayload) => Promise<void>;
  onOpenProposal: (proposal: ProposalPayload) => void;
  onOpenToolResult: (block: ConversationBlock) => void;
  onResumeTurn: () => void;
  onResolveRuntimeRequest: (
    request: PendingRuntimeRequestView,
    response: unknown,
  ) => Promise<void>;
}

export function TranscriptViewport({
  threadId,
  blocks,
  pendingRequests,
  isRunning,
  canResume,
  onApplyProposal,
  onOpenProposal,
  onOpenToolResult,
  onResumeTurn,
  onResolveRuntimeRequest,
}: TranscriptViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [followTail, setFollowTail] = useState(true);
  const requestMap = new Map(
    pendingRequests.map((request) => [request.requestId, request] as const),
  );

  useEffect(() => {
    setFollowTail(true);
  }, [threadId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !followTail) {
      return;
    }

    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight });
    });
  }, [blocks, pendingRequests, followTail]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setFollowTail(remaining < 64);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {!threadId && (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
              <h3 className="text-lg font-semibold">Assistant</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                选择一个 thread，或者直接发送消息创建新对话。
              </p>
            </div>
          )}

          {threadId && blocks.length === 0 && (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
              <h3 className="text-lg font-semibold">新的对话</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                你可以直接描述任务、问题、排期、拆解目标或让 Agent 执行分析。
              </p>
              {isRunning && (
                <p className="mt-3 text-xs text-muted-foreground">Runtime 正在启动当前 turn。</p>
              )}
              {canResume && (
                <Button className="mt-4" variant="outline" onClick={onResumeTurn}>
                  继续流式输出
                </Button>
              )}
            </div>
          )}

          {blocks.map((block) => (
            <BlockRenderer
              key={block.blockId}
              block={block}
              pendingRequest={requestMap.get(block.blockId) ?? null}
              onApplyProposal={onApplyProposal}
              onOpenProposal={onOpenProposal}
              onOpenToolResult={onOpenToolResult}
              onResolveRuntimeRequest={onResolveRuntimeRequest}
            />
          ))}
        </div>
      </div>

      {!followTail && blocks.length > 0 && (
        <div className="pointer-events-none absolute right-4 bottom-4">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto shadow-sm"
            onClick={() => {
              setFollowTail(true);
              viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
            }}
          >
            跳到最新
          </Button>
        </div>
      )}
    </div>
  );
}
