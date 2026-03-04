import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { CalendarViewMode } from './calendar-utils';
import { formatDateTitle } from './calendar-utils';

interface CalendarToolbarProps {
  currentDate: Date;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onToday: () => void;
}

export function CalendarToolbar({
  currentDate,
  viewMode,
  onViewModeChange,
  onNavigateBack,
  onNavigateForward,
  onToday,
}: CalendarToolbarProps) {
  return (
    <div className="flex h-10 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onNavigateBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onNavigateForward}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={onToday}
        >
          Today
        </Button>
        <span className="ml-2 text-sm font-medium">
          {formatDateTitle(currentDate, viewMode)}
        </span>
      </div>

      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => {
          if (v) onViewModeChange(v as CalendarViewMode);
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="day" className="h-7 px-2.5 text-xs">
          Day
        </ToggleGroupItem>
        <ToggleGroupItem value="week" className="h-7 px-2.5 text-xs">
          Week
        </ToggleGroupItem>
        <ToggleGroupItem value="month" className="h-7 px-2.5 text-xs">
          Month
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
