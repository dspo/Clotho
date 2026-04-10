import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, CircleAlert, Cog, Sparkles } from 'lucide-react';
import type { ConversationBlock, ProposalPayload } from '@/types/assistant-runtime';
import { Badge } from '@/components/ui/badge';
import {
  asRecord,
  getBlockTurnId,
  isBlockHidden,
  type PendingRuntimeRequestView,
} from '@/stores/assistant/helpers';
import { runtimeStatusLabel } from '../status-labels';
import { ProposalCard } from './ProposalCard';
import { RuntimeRequestCard } from './RuntimeRequestCard';

interface BlockRendererProps {
  block: ConversationBlock;
  pendingRequest: PendingRuntimeRequestView | null;
  onApplyProposal: (proposal: ProposalPayload) => Promise<void>;
  onOpenProposal: (proposal: ProposalPayload) => void;
  onOpenToolResult: (block: ConversationBlock) => void;
  onResolveRuntimeRequest: (
    request: PendingRuntimeRequestView,
    response: unknown,
  ) => Promise<void>;
}

function JsonDetails({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  if (value == null) {
    return null;
  }

  return (
    <details className="rounded-lg border bg-muted/20">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="overflow-x-auto px-3 py-3 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function ReasoningBlock({ block }: { block: ConversationBlock }) {
  const [open, setOpen] = useState(block.status === 'streaming');

  useEffect(() => {
    if (block.status === 'streaming') {
      setOpen(true);
    }
  }, [block.status]);

  return (
    <div className="rounded-2xl border bg-muted/20">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{block.title ?? '思考过程'}</div>
          <div className="text-xs text-muted-foreground">
            {block.status === 'streaming' ? '正在推理' : '已完成'}
          </div>
        </div>
        <Badge variant="outline">{runtimeStatusLabel(block.status)}</Badge>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {block.text || '无推理内容。'}
        </div>
      )}
    </div>
  );
}

function PlanBlock({ block }: { block: ConversationBlock }) {
  const metadata = asRecord(block.metadata);
  const plan = Array.isArray(metadata?.plan) ? metadata.plan : [];
  const explanation = typeof metadata?.explanation === 'string' ? metadata.explanation : null;
  const updatedAt = typeof metadata?.updatedAt === 'string' ? metadata.updatedAt : null;
  const source = typeof metadata?.source === 'string' ? metadata.source : null;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{block.title ?? '计划'}</div>
          <div className="text-xs text-muted-foreground">
            {source === 'system:update_plan' ? '由系统规划工具更新' : '规划状态'}
          </div>
        </div>
        <Badge variant="outline">{runtimeStatusLabel(block.status)}</Badge>
      </div>

      {(block.text || explanation) && (
        <div className="mt-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {block.text || explanation}
        </div>
      )}

      {plan.length > 0 && (
        <div className="mt-4 space-y-2">
          {plan.map((item, index) => {
            const step = asRecord(item);
              const label = typeof step?.step === 'string' ? step.step : `步骤 ${index + 1}`;
            const status = typeof step?.status === 'string' ? step.status : 'pending';
            return (
              <div key={`${label}-${index}`} className="flex items-start gap-3 rounded-xl border bg-muted/20 px-3 py-2">
                <Badge variant="secondary">{status}</Badge>
                <div className="min-w-0 flex-1 text-sm leading-6">{label}</div>
              </div>
            );
          })}
        </div>
      )}

      {(updatedAt || metadata) && (
        <div className="mt-3 space-y-3">
          {updatedAt ? (
            <div className="text-xs text-muted-foreground">更新时间 {updatedAt}</div>
          ) : null}
          <JsonDetails label="元数据" value={metadata} />
        </div>
      )}
    </div>
  );
}

export function BlockRenderer({
  block,
  pendingRequest,
  onApplyProposal,
  onOpenProposal,
  onOpenToolResult,
  onResolveRuntimeRequest,
}: BlockRendererProps) {
  if (isBlockHidden(block)) {
    return null;
  }

  if (block.kind === 'user_message') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-primary-foreground shadow-sm">
          {block.text}
        </div>
      </div>
    );
  }

  if (block.kind === 'assistant_message') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl border bg-card px-4 py-3 text-sm leading-6 whitespace-pre-wrap shadow-sm">
          {block.text}
        </div>
      </div>
    );
  }

  if (block.kind === 'reasoning') {
    return <ReasoningBlock block={block} />;
  }

  if (block.kind === 'plan') {
    return <PlanBlock block={block} />;
  }

  if (block.kind === 'tool_call') {
    return (
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Cog className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{block.title ?? '工具调用'}</div>
            <div className="text-xs text-muted-foreground">
              turn {getBlockTurnId(block) ?? 'unknown'}
            </div>
          </div>
          <Badge variant="outline">{runtimeStatusLabel(block.status)}</Badge>
        </div>

        {block.text && (
          <div className="mt-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
            {block.text}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted/40"
            onClick={() => onOpenToolResult(block)}
          >
            查看结果
          </button>
        </div>
      </div>
    );
  }

  if (block.kind === 'runtime_request') {
    return (
      <RuntimeRequestCard
        block={block}
        request={pendingRequest}
        onResolve={onResolveRuntimeRequest}
      />
    );
  }

  if (block.kind === 'proposal') {
    return (
      <ProposalCard
        block={block}
        onApply={onApplyProposal}
        onOpen={onOpenProposal}
      />
    );
  }

  if (block.kind === 'error') {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/8 p-4">
        <div className="flex items-center gap-2">
          <CircleAlert className="h-4 w-4 text-destructive" />
          <div className="text-sm font-medium text-destructive">
            {block.title ?? '助手错误'}
          </div>
        </div>
        <div className="mt-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {block.text}
        </div>
      </div>
    );
  }

  if (block.kind === 'system_notice') {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="text-sm font-medium">{block.title ?? '系统通知'}</div>
        <div className="mt-2 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {block.text}
        </div>
      </div>
    );
  }

  const metadata = asRecord(block.metadata);

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium">{block.title ?? block.kind}</div>
        <Badge variant="outline">{runtimeStatusLabel(block.status)}</Badge>
      </div>
      <div className="mt-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
        {block.text}
      </div>
      <div className="mt-3">
        <JsonDetails label="元数据" value={metadata} />
      </div>
    </div>
  );
}
