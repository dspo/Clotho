import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/constants';
import type { TaskStatus, TaskPriority } from '@/types/task';

interface BatchActionBarProps {
  count: number;
  onStatusChange: (status: TaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BatchActionBar({
  count,
  onStatusChange,
  onPriorityChange,
  onDelete,
  onClear,
}: BatchActionBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 px-3 h-10 bg-accent/10 border-b">
        <span className="text-sm font-medium">
          {count} selected
        </span>
        <div className="h-4 w-px bg-border" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Set status
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1" align="start">
            {TASK_STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={() => onStatusChange(s.value)}
              >
                <StatusBadge status={s.value} />
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Set priority
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="start">
            {TASK_PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={() => onPriorityChange(p.value)}
              >
                <PriorityBadge priority={p.value} />
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>

        <div className="flex-1" />

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${count} tasks?`}
        description="This action cannot be undone. The tasks will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}
