import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon, ChevronDown } from 'lucide-react';

type DatePreset = 'overdue' | 'today' | 'this_week' | 'custom';

interface DateFilterProps {
  value: DatePreset | null;
  onChange: (value: DatePreset | null) => void;
  className?: string;
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
];

export function DateFilter({ value, onChange, className }: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const activeLabel = DATE_PRESETS.find((p) => p.value === value)?.label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 gap-1', value && 'border-primary', className)}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {activeLabel ?? 'Due date'}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              onChange(value === preset.value ? null : preset.value);
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
              value === preset.value && 'bg-accent font-medium',
            )}
          >
            {preset.label}
          </button>
        ))}
        {value && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              Clear filter
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export type { DatePreset };
