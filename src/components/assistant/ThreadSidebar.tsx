import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { LoaderCircle, MessageSquarePlus, Search, Sparkles } from 'lucide-react';
import type { ThreadSummary } from '@/types/assistant-runtime';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface ThreadSidebarProps {
  open: boolean;
  connectionState: string;
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onOpenChange: (open: boolean) => void;
}

function formatUpdatedAt(updatedAt: string) {
  try {
    return formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true });
  } catch {
    return '';
  }
}

export function ThreadSidebar({
  open,
  connectionState,
  threads,
  activeThreadId,
  onCreateThread,
  onSelectThread,
  onOpenChange,
}: ThreadSidebarProps) {
  const [query, setQuery] = useState('');

  const filteredThreads = threads.filter((thread) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return (
      thread.title.toLowerCase().includes(normalizedQuery) ||
      thread.lastMessagePreview.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <>
      {open && (
        <button
          className="absolute inset-0 z-20 bg-black/20 lg:hidden"
          onClick={() => onOpenChange(false)}
          aria-label="Close threads"
        />
      )}
      <aside
        className={cn(
          'absolute inset-y-0 left-0 z-30 flex w-80 flex-col border-r bg-background transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="truncate text-sm font-semibold">助手对话</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Runtime {connectionState === 'connected' ? '已连接' : connectionState}
            </p>
          </div>
          <Button size="icon-sm" variant="outline" onClick={onCreateThread}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-4 pb-3">
          <Badge variant={connectionState === 'connected' ? 'secondary' : 'outline'}>
            {connectionState === 'connected' ? '已连接' : '未连接'}
          </Badge>
        </div>

        <Separator />

        <div className="px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 thread"
              className="pl-9"
            />
          </div>
        </div>

        <Separator />

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {filteredThreads.length === 0 && (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {threads.length === 0 ? '还没有 thread，先新建一个对话。' : '没有匹配的 thread。'}
              </div>
            )}
            {filteredThreads.map((thread) => (
              <button
                key={thread.threadId}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                  thread.threadId === activeThreadId
                    ? 'border-primary/30 bg-primary/6'
                    : 'border-transparent hover:border-border hover:bg-muted/50',
                )}
                onClick={() => {
                  onSelectThread(thread.threadId);
                  onOpenChange(false);
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{thread.title}</span>
                      {thread.hasRunningTurn && (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {thread.lastMessagePreview || '空白对话'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatUpdatedAt(thread.updatedAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
