import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { TASK_STATUSES } from '@/lib/constants';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ChevronDown } from 'lucide-react';
import type { TaskStatus } from '@/types/task';

interface StatusFilterProps {
  selected: TaskStatus[];
  onChange: (statuses: TaskStatus[]) => void;
  className?: string;
}

export function StatusFilter({ selected, onChange, className }: StatusFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(
    (value: TaskStatus) => {
      if (selected.includes(value)) {
        onChange(selected.filter((s) => s !== value));
      } else {
        onChange([...selected, value]);
      }
    },
    [selected, onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 gap-1', selected.length > 0 && 'border-primary', className)}
        >
          Status
          {selected.length > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        {TASK_STATUSES.map((s) => (
          <label
            key={s.value}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
          >
            <Checkbox
              checked={selected.includes(s.value)}
              onCheckedChange={() => toggle(s.value)}
            />
            <StatusBadge status={s.value} />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
