import { useRef, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TASK_STATUSES } from '@/lib/constants';
import type { TaskStatus } from '@/types/task';

interface StatusCellProps {
  status: TaskStatus;
  isEditing: boolean;
  onSave: (value: TaskStatus) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onTabNext: () => void;
}

export function StatusCell({
  status,
  isEditing,
  onSave,
  onStartEdit: _onStartEdit,
  onCancelEdit,
  onTabNext,
}: StatusCellProps) {
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
        <StatusBadge status={status} />
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
          <StatusBadge status={status} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {TASK_STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => {
              onSave(s.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                onSave(status);
                onTabNext();
              }
            }}
          >
            <StatusBadge status={s.value} />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
