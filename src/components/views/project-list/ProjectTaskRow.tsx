import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { DateDisplay } from '@/components/common/DateDisplay';
import type { TaskWithTags } from '@/types/task';

interface ProjectTaskRowProps {
  task: TaskWithTags;
  onToggleStatus: (taskId: string) => void;
  onDoubleClick: (taskId: string) => void;
}

export function ProjectTaskRow({ task, onToggleStatus, onDoubleClick }: ProjectTaskRowProps) {
  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';

  return (
    <div
      className="group flex h-10 items-center gap-3 pl-10 pr-4 hover:bg-muted/50 cursor-pointer transition-colors"
      onDoubleClick={() => onDoubleClick(task.id)}
    >
      <Checkbox
        checked={isDone}
        disabled={isCancelled}
        onCheckedChange={() => {
          onToggleStatus(task.id);
        }}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      <span
        className={cn(
          'flex-1 truncate text-sm',
          isDone && 'line-through text-muted-foreground',
          isCancelled && 'line-through text-muted-foreground',
        )}
      >
        {task.title}
      </span>
      <StatusBadge status={task.status} className="text-xs shrink-0" />
      <PriorityBadge priority={task.priority} showLabel={false} className="shrink-0" />
      <DateDisplay date={task.due_date} className="text-xs shrink-0" />
    </div>
  );
}
