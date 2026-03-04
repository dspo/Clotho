import { cn } from '@/lib/utils';
import { formatDateShort, isOverdue } from '@/lib/date';
import { isToday, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';

interface DateDisplayProps {
  date: string | null;
  showIcon?: boolean;
  className?: string;
}

export function DateDisplay({ date, showIcon = false, className }: DateDisplayProps) {
  if (!date) return null;

  const overdue = isOverdue(date);
  const today = isToday(parseISO(date));

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm',
        overdue && 'text-destructive',
        today && 'text-amber-500',
        !overdue && !today && 'text-muted-foreground',
        className,
      )}
    >
      {showIcon && <Calendar className="h-3.5 w-3.5 shrink-0" />}
      {formatDateShort(date)}
    </span>
  );
}
