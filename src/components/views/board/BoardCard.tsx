import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { TagChip } from '@/components/common/TagChip';
import { DateDisplay } from '@/components/common/DateDisplay';
import { ProgressBar } from '@/components/common/ProgressBar';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { TaskWithTags } from '@/types/task';

interface BoardCardProps {
  task: TaskWithTags;
  subtasks?: TaskWithTags[];
  dimmed?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  isSelected?: boolean;
  projectColor?: string;
}

export function BoardCard({ task, subtasks, dimmed, onClick, onDoubleClick, isSelected, projectColor }: BoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: dimmed,
    data: {
      type: 'Task',
      task,
    },
  });

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const barColor = projectColor ?? '#3B82F6';

  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';
  const completedCount = subtasks?.filter((s) => s.status === 'done').length ?? 0;
  const totalSubtasks = subtasks?.length ?? 0;
  const hasTags = task.tags.length > 0;
  const hasDueDate = !!task.due_date;
  const hasMetaRow = hasTags || hasDueDate;
  const hasSubtasks = totalSubtasks > 0;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (!dimmed && onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      onDoubleClick={(e) => {
        if (!dimmed && onDoubleClick) {
          e.stopPropagation();
          onDoubleClick();
        }
      }}
      className={cn(
        'group relative cursor-grab rounded-md border bg-card shadow-sm transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-md',
        'active:translate-y-0 active:shadow-sm',
        isDragging && 'opacity-0',
        dimmed && 'pointer-events-none opacity-30',
        isDone && 'bg-green-50 dark:bg-green-950/30',
        isCancelled && 'bg-gray-50 dark:bg-gray-950/30',
        isSelected && 'ring-2 ring-primary',
      )}
      style={{
        ...dndStyle,
        borderLeftWidth: '3px',
        borderLeftColor: isDone ? '#10B981' : isCancelled ? '#9CA3AF' : barColor,
      }}
    >
      <div className="px-3 py-2.5 space-y-2">
        {/* Title */}
        <p
          className={cn(
            'text-sm font-medium leading-snug line-clamp-2',
            isDone && 'line-through text-green-700 dark:text-green-400',
            isCancelled && 'line-through text-gray-500 dark:text-gray-400',
          )}
        >
          {isDone && (
            <CheckCircle2 className="inline-block h-3.5 w-3.5 mr-1 mb-0.5 text-green-500 shrink-0" />
          )}
          {isCancelled && (
            <XCircle className="inline-block h-3.5 w-3.5 mr-1 mb-0.5 text-gray-400 shrink-0" />
          )}
          {task.title}
        </p>

        {/* Tags + Due Date */}
        {hasMetaRow && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
              {task.tags.slice(0, 2).map((tag) => (
                <TagChip
                  key={tag.id}
                  tag={tag}
                  className="text-[11px] px-1.5 py-0 border-0"
                />
              ))}
              {task.tags.length > 2 && (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  +{task.tags.length - 2}
                </span>
              )}
            </div>
            {hasDueDate && (
              <DateDisplay
                date={task.due_date}
                showIcon
                className="text-xs shrink-0"
              />
            )}
          </div>
        )}

        {/* Subtask progress */}
        {hasSubtasks && (
          <div className="flex items-center gap-2">
            <ProgressBar
              completed={completedCount}
              total={totalSubtasks}
              className="flex-1"
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {completedCount}/{totalSubtasks}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
