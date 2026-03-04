import { cn } from '@/lib/utils';
import type { TaskWithTags } from '@/types/task';

interface BoardCardOverlayProps {
  task: TaskWithTags;
  projectColor?: string;
}

export function BoardCardOverlay({ task, projectColor }: BoardCardOverlayProps) {
  const barColor = projectColor ?? '#3B82F6';

  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';

  return (
    <div
      className={cn(
        'w-[264px] rounded-md border bg-card shadow-xl',
        'rotate-[2deg] scale-[1.02] opacity-85',
      )}
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: isDone || isCancelled ? '#D1D5DB' : barColor,
      }}
    >
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium leading-snug line-clamp-2">
          {task.title}
        </p>
      </div>
    </div>
  );
}
