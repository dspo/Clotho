import { useRef, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { TASK_PRIORITIES } from '@/lib/constants';
import type { TaskPriority } from '@/types/task';

interface PriorityCellProps {
  priority: TaskPriority;
  isEditing: boolean;
  onSave: (value: TaskPriority) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onTabNext: () => void;
}

export function PriorityCell({
  priority,
  isEditing,
  onSave,
  onStartEdit: _onStartEdit,
  onCancelEdit,
  onTabNext,
}: PriorityCellProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isEditing) {
      triggerRef.current?.click();
    }
  }, [isEditing]);

  if (!isEditing) {
    return (
      <div
        className="flex items-center h-full"
      >
        <PriorityBadge priority={priority} />
      </div>
    );
  }

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) onCancelEdit();
      }}
    >
      <PopoverTrigger asChild>
        <button ref={triggerRef} className="flex items-center h-full w-full">
          <PriorityBadge priority={priority} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="start">
        {TASK_PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => {
              onSave(p.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                onSave(priority);
                onTabNext();
              }
            }}
          >
            <PriorityBadge priority={p.value} />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
