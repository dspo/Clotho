import {
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TASK_PRIORITIES } from '@/lib/constants';
import type { TaskPriority } from '@/types/task';

const PRIORITY_ICONS: Record<string, React.ElementType> = {
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
};

interface PriorityBadgeProps {
  priority: TaskPriority;
  showLabel?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, showLabel = true, className }: PriorityBadgeProps) {
  const config = TASK_PRIORITIES.find((p) => p.value === priority);
  if (!config) return null;

  const Icon = PRIORITY_ICONS[config.icon];

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm', className)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.color }} />
      {showLabel && (
        <span className="whitespace-nowrap" style={{ color: config.color }}>
          {config.label}
        </span>
      )}
    </span>
  );
}
