import {
  Circle,
  CircleDot,
  Timer,
  CheckCircle2,
  XCircle,
  CalendarOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TASK_STATUSES } from '@/lib/constants';
import type { TaskStatus } from '@/types/task';

const STATUS_ICONS: Record<string, React.ElementType> = {
  Circle,
  CircleDot,
  Timer,
  CheckCircle2,
  XCircle,
  CalendarOff,
};

interface StatusBadgeProps {
  status: TaskStatus;
  showLabel?: boolean;
  className?: string;
}

export function StatusBadge({ status, showLabel = true, className }: StatusBadgeProps) {
  const config = TASK_STATUSES.find((s) => s.value === status);
  if (!config) return null;

  const Icon = STATUS_ICONS[config.icon];

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
