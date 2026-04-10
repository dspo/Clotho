import { FileJson2, LoaderCircle } from 'lucide-react';
import type { ConversationBlock, ProposalPayload } from '@/types/assistant-runtime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getProposalPayload } from '@/stores/assistant/helpers';

interface ProposalCardProps {
  block: ConversationBlock;
  onApply: (proposal: ProposalPayload) => Promise<void>;
  onOpen: (proposal: ProposalPayload) => void;
}

function statusLabel(status: string | null) {
  switch (status) {
    case 'preview':
      return '待应用';
    case 'applying':
      return '应用中';
    case 'applied':
      return '已应用';
    case 'failed':
      return '失败';
    default:
      return status ?? '提案';
  }
}

export function ProposalCard({ block, onApply, onOpen }: ProposalCardProps) {
  const proposal = getProposalPayload(block);
  const applying = block.status === 'applying';

  if (!proposal) {
    return (
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileJson2 className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">提案</div>
          <Badge variant="outline">{statusLabel(block.status)}</Badge>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">{block.text}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <FileJson2 className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">提案</div>
          <div className="text-xs text-muted-foreground">
            {proposal.intent} · {proposal.actions.length} actions · {proposal.artifacts.length} artifacts
          </div>
        </div>
        <Badge variant={block.status === 'applied' ? 'secondary' : 'outline'}>
          {statusLabel(block.status)}
        </Badge>
      </div>

      <div className="mt-3 text-sm leading-6 whitespace-pre-wrap">{proposal.summary}</div>

      <div className="mt-3 flex flex-wrap gap-2">
        {proposal.requires_confirmation && <Badge variant="outline">需要确认</Badge>}
        {proposal.warnings.length > 0 && (
          <Badge variant="outline">{proposal.warnings.length} warnings</Badge>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpen(proposal)}>
          查看详情
        </Button>
        {block.status !== 'applied' && (
          <Button
            size="sm"
            disabled={applying}
            onClick={() => void onApply(proposal)}
          >
            {applying && <LoaderCircle className="h-4 w-4 animate-spin" />}
            应用提案
          </Button>
        )}
      </div>
    </div>
  );
}
