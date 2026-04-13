import { FileJson2, LoaderCircle } from 'lucide-react';
import type { ConversationBlock, ProposalPayload } from '@/types/assistant-runtime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getProposalPayload } from '@/stores/assistant/helpers';
import { proposalStatusLabel } from '../status-labels';

interface ProposalCardProps {
  block: ConversationBlock;
  onApply: (proposal: ProposalPayload) => Promise<void>;
  onOpen: (proposal: ProposalPayload) => void;
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
          <Badge variant="outline">{proposalStatusLabel(block.status)}</Badge>
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
            {proposal.intent} · {proposal.actions.length} 个动作 · {proposal.artifacts.length} 个产物
          </div>
        </div>
        <Badge variant={block.status === 'applied' ? 'secondary' : 'outline'}>
          {proposalStatusLabel(block.status)}
        </Badge>
      </div>

      <div className="mt-3 text-sm leading-6 whitespace-pre-wrap">{proposal.summary}</div>

      <div className="mt-3 flex flex-wrap gap-2">
        {proposal.requires_confirmation && <Badge variant="outline">需要确认</Badge>}
        {proposal.warnings.length > 0 && (
          <Badge variant="outline">{proposal.warnings.length} 条警告</Badge>
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
