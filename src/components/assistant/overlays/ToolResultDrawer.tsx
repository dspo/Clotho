import { Cog } from 'lucide-react';
import type { ConversationBlock } from '@/types/assistant-runtime';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { asRecord } from '@/stores/assistant/helpers';

interface ToolResultDrawerProps {
  open: boolean;
  block: ConversationBlock | null;
  onOpenChange: (open: boolean) => void;
}

function JsonPanel({
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

export function ToolResultDrawer({
  open,
  block,
  onOpenChange,
}: ToolResultDrawerProps) {
  const metadata = asRecord(block?.metadata);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDescription
        className="left-auto top-0 right-0 h-screen w-[min(680px,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-l p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Cog className="h-4 w-4 text-primary" />
              工具结果
            </DialogTitle>
            <DialogDescription>
              查看本次工具调用的摘要、输出与结构化元数据。
            </DialogDescription>
          </DialogHeader>

          {block ? (
            <>
              <div className="flex flex-wrap items-center gap-2 px-6 pt-2">
                <Badge variant="outline">{block.title ?? 'tool_call'}</Badge>
                {block.status && <Badge variant="secondary">{block.status}</Badge>}
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-6 px-6 py-5">
                  {block.text && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">摘要</h3>
                      <div className="rounded-xl border p-4 text-sm leading-6 whitespace-pre-wrap">
                        {block.text}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">详情</h3>
                    <JsonPanel label="元数据" value={metadata} />
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-muted-foreground">
              当前没有可展示的工具结果。
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
