import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateDisplay } from '@/components/common/DateDisplay';
import { parseISO, format } from 'date-fns';

interface DateCellProps {
  date: string | null;
  isEditing: boolean;
  onSave: (value: string | null) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}

export function DateCell({
  date,
  isEditing,
  onSave,
  onStartEdit: _onStartEdit,
  onCancelEdit,
}: DateCellProps) {
  if (!isEditing) {
    return (
      <div
        className="flex items-center h-full"
      >
        {date ? (
          <DateDisplay date={date} />
        ) : (
          <span className="text-sm text-muted-foreground">&mdash;</span>
        )}
      </div>
    );
  }

  const selected = date ? parseISO(date) : undefined;

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) onCancelEdit();
      }}
    >
      <PopoverTrigger asChild>
        <div className="flex items-center h-full w-full">
          {date ? (
            <DateDisplay date={date} />
          ) : (
            <span className="text-sm text-muted-foreground">&mdash;</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              onSave(format(day, 'yyyy-MM-dd'));
            } else {
              onSave(null);
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
