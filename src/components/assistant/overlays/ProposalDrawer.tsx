import { useEffect, useState } from 'react';
import { AlertTriangle, FileJson2, LoaderCircle, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProposalPayload,
  ProposalSimulationReport,
} from '@/types/assistant-runtime';
import { assistantRuntimeClient } from '@/services/assistant-runtime-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface ProposalDrawerProps {
  open: boolean;
  proposal: ProposalPayload | null;
  status: string | null;
  onOpenChange: (open: boolean) => void;
  onApply: (proposal: ProposalPayload) => Promise<void>;
}

function JsonPanel({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-xl border bg-muted/20">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
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

export function ProposalDrawer({
  open,
  proposal,
  status,
  onOpenChange,
  onApply,
}: ProposalDrawerProps) {
  const applying = status === 'applying';
  const [simulation, setSimulation] = useState<ProposalSimulationReport | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);

  useEffect(() => {
    if (!open || !proposal) {
      setSimulation(null);
      setSimulationLoading(false);
      return;
    }

    let cancelled = false;
    setSimulationLoading(true);
    void assistantRuntimeClient
      .simulateProposal({
        threadId: proposal.thread_id,
        turnId: proposal.turn_id,
        proposalId: proposal.proposal_id,
      })
      .then((report) => {
        if (!cancelled) {
          setSimulation(report);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSimulation(null);
          toast.error(`提案预检失败: ${String(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSimulationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, proposal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDescription
        className="left-auto top-0 right-0 h-screen w-[min(720px,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-l p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <FileJson2 className="h-4 w-4 text-primary" />
              Proposal Details
            </DialogTitle>
            <DialogDescription>
              查看提案的 canonical payload、动作明细与 artifact。
            </DialogDescription>
          </DialogHeader>

          {proposal ? (
            <>
              <div className="flex flex-wrap items-center gap-2 px-6 pt-2">
                <Badge variant={status === 'applied' ? 'secondary' : 'outline'}>
                  {statusLabel(status)}
                </Badge>
                <Badge variant="outline">{proposal.intent}</Badge>
                <Badge variant="outline">{proposal.actions.length} actions</Badge>
                <Badge variant="outline">{proposal.artifacts.length} artifacts</Badge>
              </div>

              <div className="flex flex-wrap gap-2 px-6 py-4">
                <Button
                  disabled={
                    applying ||
                    status === 'applied' ||
                    (simulation !== null && !simulation.valid)
                  }
                  onClick={() => void onApply(proposal)}
                >
                  {applying && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  应用提案
                </Button>
              </div>

              <Separator />

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-6 px-6 py-5">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Preflight</h3>
                    {simulationLoading ? (
                      <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        正在执行 proposal simulate / preflight…
                      </div>
                    ) : simulation ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {simulation.valid ? (
                              <>
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                <span className="text-sm font-medium">预检通过</span>
                              </>
                            ) : (
                              <>
                                <ShieldX className="h-4 w-4 text-destructive" />
                                <span className="text-sm font-medium">预检失败</span>
                              </>
                            )}
                            <Badge variant="outline">{simulation.actionCount} actions</Badge>
                          </div>
                          {Object.entries(simulation.actionTypeCounts).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {Object.entries(simulation.actionTypeCounts).map(([type, count]) => (
                                <Badge key={type} variant="secondary">
                                  {type} × {count}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {simulation.notices.length > 0 && (
                          <div className="space-y-2">
                            {simulation.notices.map((notice) => (
                              <div
                                key={notice}
                                className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 p-3"
                              >
                                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                                <div className="text-sm text-muted-foreground">{notice}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                        当前没有可用的 preflight 结果。
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Summary</h3>
                    <div className="rounded-xl border p-4 text-sm leading-6 whitespace-pre-wrap">
                      {proposal.summary}
                    </div>
                    {proposal.reasoning_summary && (
                      <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                        {proposal.reasoning_summary}
                      </div>
                    )}
                  </div>

                  {proposal.warnings.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Warnings</h3>
                      <div className="space-y-2">
                        {proposal.warnings.map((warning) => (
                          <div
                            key={warning}
                            className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3"
                          >
                            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                            <div className="text-sm text-muted-foreground">{warning}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Actions</h3>
                    <div className="space-y-3">
                      {proposal.actions.map((action) => (
                        <div key={action.action_id} className="rounded-xl border p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium">{action.title}</div>
                            <Badge variant="outline">{action.action_type}</Badge>
                            <Badge variant="outline">{action.target_type}</Badge>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {action.summary}
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <JsonPanel label="Before" value={action.before_json} />
                            <JsonPanel label="After" value={action.after_json} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {proposal.artifacts.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Artifacts</h3>
                      <div className="space-y-3">
                        {proposal.artifacts.map((artifact) => (
                          <div key={artifact.artifact_id} className="rounded-xl border p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-medium">{artifact.title}</div>
                              <Badge variant="outline">{artifact.artifact_type}</Badge>
                            </div>
                            <div className="mt-3">
                              <JsonPanel label="Content" value={artifact.content_json} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Canonical JSON</h3>
                    <JsonPanel label="Proposal Payload" value={proposal} />
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-muted-foreground">
              当前没有可展示的 proposal。
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
