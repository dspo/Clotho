import { useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Maximize2,
  Minus,
  Plus,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProjectFilter } from '@/components/filter/ProjectFilter';
import { ZOOM_CONFIGS, ZOOM_ORDER, type ZoomLevel } from './gantt-utils';
import { cn } from '@/lib/utils';
import type { GanttDatePreset } from '@/stores/settings-store';

interface GanttToolbarProps {
  zoomLevel: ZoomLevel;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToday: () => void;
  onFitAll: () => void;
  dateRange?: { start: Date | null; end: Date | null };
  onDateRangeChange?: (start: Date | null, end: Date | null) => void;
  datePreset?: GanttDatePreset;
  onDatePresetChange?: (preset: GanttDatePreset) => void;
}

export function GanttToolbar({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onToday,
  onFitAll,
  dateRange,
  onDateRangeChange,
  datePreset,
  onDatePresetChange,
}: GanttToolbarProps) {
  const zoomIdx = ZOOM_ORDER.indexOf(zoomLevel);
  const canZoomIn = zoomIdx > 0;
  const canZoomOut = zoomIdx < ZOOM_ORDER.length - 1;

  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  return (
    <div className="flex h-10 items-center gap-2 border-b px-4">
      <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onToday}>
        <CalendarDays className="h-3.5 w-3.5" />
        Today
      </Button>
      <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onFitAll}>
        <Maximize2 className="h-3.5 w-3.5" />
        Fit all
      </Button>

      <div className="mx-2 h-4 w-px bg-border" />

      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-[48px] text-center text-xs font-medium text-muted-foreground">
        {ZOOM_CONFIGS[zoomLevel].label}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>

      {onDatePresetChange && (
        <>
          <div className="mx-2 h-4 w-px bg-border" />

          {(
            [
              { key: 'this_week', label: 'This week' },
              { key: 'this_fortnight', label: '2 weeks' },
              { key: 'this_month', label: 'This month' },
            ] as const
          ).map(({ key, label }) => (
            <Button
              key={key}
              variant={datePreset === key ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (datePreset === key) {
                  onDatePresetChange(null);
                  onDateRangeChange?.(null, null);
                } else {
                  onDatePresetChange(key);
                  const today = new Date();
                  let start: Date;
                  let end: Date;
                  if (key === 'this_week') {
                    start = startOfWeek(today, { weekStartsOn: 1 });
                    end = endOfWeek(today, { weekStartsOn: 1 });
                  } else if (key === 'this_fortnight') {
                    start = startOfWeek(today, { weekStartsOn: 1 });
                    end = addDays(endOfWeek(today, { weekStartsOn: 1 }), 7);
                  } else {
                    start = startOfMonth(today);
                    end = endOfMonth(today);
                  }
                  onDateRangeChange?.(start, end);
                }
              }}
            >
              {label}
            </Button>
          ))}
        </>
      )}

      {onDateRangeChange && (
        <>
          <div className="mx-2 h-4 w-px bg-border" />

          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />

          {/* Start date picker */}
          <Popover open={startOpen} onOpenChange={setStartOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-7 w-[100px] justify-start text-left font-normal text-xs',
                  !dateRange?.start && 'text-muted-foreground',
                )}
              >
                {dateRange?.start ? format(dateRange.start, 'yyyy-MM-dd') : 'Start'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange?.start ?? undefined}
                onSelect={(date) => {
                  onDatePresetChange?.(null);
                  onDateRangeChange(date ?? null, dateRange?.end ?? null);
                  setStartOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>

          <span className="text-xs text-muted-foreground">-</span>

          {/* End date picker */}
          <Popover open={endOpen} onOpenChange={setEndOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-7 w-[100px] justify-start text-left font-normal text-xs',
                  !dateRange?.end && 'text-muted-foreground',
                )}
              >
                {dateRange?.end ? format(dateRange.end, 'yyyy-MM-dd') : 'End'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange?.end ?? undefined}
                onSelect={(date) => {
                  onDatePresetChange?.(null);
                  onDateRangeChange(dateRange?.start ?? null, date ?? null);
                  setEndOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>

          {(dateRange?.start || dateRange?.end) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => {
                onDatePresetChange?.(null);
                onDateRangeChange(null, null);
              }}
            >
              Clear
            </Button>
          )}
        </>
      )}

      <div className="flex-1" />

      <ProjectFilter />
    </div>
  );
}
