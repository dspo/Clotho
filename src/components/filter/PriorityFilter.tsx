import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { TASK_PRIORITIES } from '@/lib/constants';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { ChevronDown } from 'lucide-react';
import type { TaskPriority } from '@/types/task';

interface PriorityFilterProps {
  selected: TaskPriority[];
  onChange: (priorities: TaskPriority[]) => void;
  className?: string;
}

export function PriorityFilter({ selected, onChange, className }: PriorityFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(
    (value: TaskPriority) => {
      if (selected.includes(value)) {
        onChange(selected.filter((p) => p !== value));
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
          Priority
          {selected.length > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        {TASK_PRIORITIES.map((p) => (
          <label
            key={p.value}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
          >
            <Checkbox
              checked={selected.includes(p.value)}
              onCheckedChange={() => toggle(p.value)}
            />
            <PriorityBadge priority={p.value} />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
