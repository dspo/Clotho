import { cn } from '@/lib/utils';

interface ProgressBarProps {
  completed: number;
  total: number;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ completed, total, className, showLabel = false }: ProgressBarProps) {
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  const barColor =
    percentage < 30 ? 'bg-red-500' :
    percentage < 70 ? 'bg-yellow-500' :
    'bg-green-500';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {percentage}%
        </span>
      )}
    </div>
  );
}
