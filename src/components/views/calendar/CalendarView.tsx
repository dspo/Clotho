import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CalendarToolbar } from './CalendarToolbar';
import {
  type CalendarViewMode,
  type CalendarEvent,
  type SpanSegment,
  getMonthDays,
  getWeekDays,
  getEventsForDay,
  navigateForward,
  navigateBackward,
  getWeekdayLabels,
  isToday,
  isSameMonth,
  isMultiDayEvent,
  computeSpanSegments,
  computeWeekSpanSegments,
  getMaxLaneForRow,
  format,
} from './calendar-utils';

const MAX_VISIBLE_EVENTS = 3;
const SPAN_HEIGHT = 20;
const SPAN_GAP = 2;

// ─── Schedule types and demo data ─────────────────────────

interface Schedule {
  id: string;
  title: string;
  date: string; // yyyy-MM-dd
  startTime?: string; // HH:mm
  endTime?: string;
  color: string;
  description?: string;
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DEMO_SCHEDULES: Schedule[] = [
  { id: 'demo-1', title: '团队周会', date: getTodayStr(), startTime: '10:00', endTime: '11:00', color: '#3B82F6' },
  { id: 'demo-2', title: '产品评审', date: getTodayStr(), startTime: '14:00', endTime: '15:30', color: '#8B5CF6' },
  { id: 'demo-3', title: '1-on-1', date: getTodayStr(), startTime: '16:00', endTime: '16:30', color: '#10B981' },
];

function scheduleToEvent(s: Schedule): CalendarEvent {
  const dateObj = new Date(s.date + 'T00:00:00');
  return {
    id: s.id,
    title: s.title,
    projectName: '',
    start: dateObj,
    end: dateObj,
    color: s.color,
    task: null as unknown as CalendarEvent['task'],
    isCompleted: false,
  };
}

// ─── No-op handlers ───────────────────────────────────────

const noop = () => {};
const noopEvent = (_event: CalendarEvent) => {};
const noopEventDrop = (_event: CalendarEvent, _day: Date) => {};
const noopDay = (_day: Date) => {};

// ─── CalendarView ─────────────────────────────────────────

export function CalendarView() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const events = useMemo(() => DEMO_SCHEDULES.map(scheduleToEvent), []);

  const handleNavigateBack = useCallback(() => {
    setCurrentDate((d) => navigateBackward(d, viewMode));
  }, [viewMode]);

  const handleNavigateForward = useCallback(() => {
    setCurrentDate((d) => navigateForward(d, viewMode));
  }, [viewMode]);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow system shortcuts (Cmd+C, Cmd+V, Cmd+A, etc.)
      if (e.metaKey || e.ctrlKey) return;

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;

      switch (e.key) {
        case 'm':
        case 'M':
          setViewMode('month');
          break;
        case 'w':
        case 'W':
          setViewMode('week');
          break;
        case 'd':
        case 'D':
          setViewMode('day');
          break;
        case 't':
        case 'T':
          handleToday();
          break;
        case 'ArrowLeft':
        case 'h':
          handleNavigateBack();
          break;
        case 'ArrowRight':
        case 'l':
          handleNavigateForward();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNavigateBack, handleNavigateForward, handleToday]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-1 flex-col overflow-hidden">
        <CalendarToolbar
          currentDate={currentDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNavigateBack={handleNavigateBack}
          onNavigateForward={handleNavigateForward}
          onToday={handleToday}
        />

        <div className="flex-1 overflow-auto">
          {viewMode === 'month' && (
            <MonthGrid
              currentDate={currentDate}
              events={events}
              onEventClick={noopEvent}
              onEventDoubleClick={noopEvent}
              onDayDoubleClick={noopDay}
              onEventDrop={noopEventDrop}
              onDayClick={(day) => {
                setCurrentDate(day);
                setViewMode('day');
              }}
            />
          )}
          {viewMode === 'week' && (
            <WeekGrid
              currentDate={currentDate}
              events={events}
              onEventClick={noopEvent}
              onEventDoubleClick={noopEvent}
              onDayDoubleClick={noopDay}
              onEventDrop={noopEventDrop}
            />
          )}
          {viewMode === 'day' && (
            <DayGrid
              currentDate={currentDate}
              events={events}
              onEventClick={noopEvent}
              onEventDoubleClick={noopEvent}
              onDoubleClick={noop}
              onEventDrop={noopEventDrop}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Month Grid ──────────────────────────────────────────

interface MonthGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick: (event: CalendarEvent) => void;
  onDayDoubleClick: (day: Date) => void;
  onDayClick: (day: Date) => void;
  onEventDrop: (event: CalendarEvent, targetDay: Date) => void;
}

function MonthGrid({
  currentDate,
  events,
  onEventClick,
  onEventDoubleClick,
  onDayDoubleClick,
  onDayClick,
  onEventDrop,
}: MonthGridProps) {
  const days = getMonthDays(currentDate);
  const weekdayLabels = getWeekdayLabels();

  const spanSegments = useMemo(() => computeSpanSegments(events, days), [events, days]);

  // Compute max lanes per row for spacing
  const maxLanesPerRow = useMemo(() => {
    const result: number[] = [];
    for (let row = 0; row < 6; row++) {
      result.push(getMaxLaneForRow(spanSegments, row));
    }
    return result;
  }, [spanSegments]);

  // Group segments by row
  const segmentsByRow = useMemo(() => {
    const map = new Map<number, SpanSegment[]>();
    for (const seg of spanSegments) {
      const arr = map.get(seg.row) ?? [];
      arr.push(seg);
      map.set(seg.row, arr);
    }
    return map;
  }, [spanSegments]);

  // Set of multi-day event IDs (to exclude from single-day rendering)
  const multiDayIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (isMultiDayEvent(e)) set.add(e.id);
    }
    return set;
  }, [events]);

  // Drag-and-drop state
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const dragEventRef = useRef<CalendarEvent | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, event: CalendarEvent) => {
    dragEventRef.current = event;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', event.id);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '';
    }
    dragEventRef.current = null;
    setDragOverDay(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dayKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, day: Date) => {
    e.preventDefault();
    setDragOverDay(null);
    const event = dragEventRef.current;
    if (event) {
      onEventDrop(event, day);
      dragEventRef.current = null;
    }
  }, [onEventDrop]);

  return (
    <div className="flex h-full flex-col">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex flex-1 flex-col">
        {Array.from({ length: 6 }, (_, rowIdx) => {
          const rowDays = days.slice(rowIdx * 7, rowIdx * 7 + 7);
          const laneCount = maxLanesPerRow[rowIdx];
          const spanAreaHeight = laneCount > 0 ? laneCount * (SPAN_HEIGHT + SPAN_GAP) : 0;
          const rowSegments = segmentsByRow.get(rowIdx) ?? [];

          return (
            <div key={rowIdx} className="relative flex-1 min-h-[100px]">
              {/* Span event bars (absolute positioned) */}
              {rowSegments.map((seg) => {
                const leftPct = (seg.startCol / 7) * 100;
                const widthPct = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                const top = 26 + seg.lane * (SPAN_HEIGHT + SPAN_GAP);

                return (
                  <button
                    key={`${seg.eventId}-${seg.row}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, seg.event)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'absolute z-10 truncate px-1.5 text-xs text-white leading-5 cursor-grab active:cursor-grabbing',
                      seg.isStart && seg.isEnd && 'rounded',
                      seg.isStart && !seg.isEnd && 'rounded-l',
                      !seg.isStart && seg.isEnd && 'rounded-r',
                      !seg.isStart && !seg.isEnd && 'rounded-none',
                      seg.event.isCompleted && 'opacity-50',
                    )}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      top: `${top}px`,
                      height: `${SPAN_HEIGHT}px`,
                      backgroundColor: seg.event.color,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(seg.event);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onEventDoubleClick(seg.event);
                    }}
                    title={seg.event.title}
                  >
                    {seg.isStart && (
                      <span className={cn('truncate', seg.event.isCompleted && 'line-through')}>
                        {seg.event.projectName && (
                          <span className="opacity-70 mr-1">{seg.event.projectName}</span>
                        )}
                        {seg.event.title}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Day cells grid */}
              <div className="grid h-full grid-cols-7">
                {rowDays.map((day, colIdx) => {
                  const dayEvents = getEventsForDay(events, day).filter(
                    (e) => !multiDayIds.has(e.id),
                  );
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const today = isToday(day);
                  const dayKey = day.toISOString();

                  return (
                    <div
                      key={colIdx}
                      className={cn(
                        'relative border-b border-r p-1',
                        !isCurrentMonth && 'bg-muted/30',
                        dragOverDay === dayKey && 'bg-primary/10',
                      )}
                      onDoubleClick={() => onDayDoubleClick(day)}
                      onDragOver={(e) => handleDragOver(e, dayKey)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, day)}
                    >
                      {/* Date number */}
                      <button
                        onClick={() => onDayClick(day)}
                        className={cn(
                          'mb-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                          today && 'bg-primary text-primary-foreground font-medium',
                          !today && isCurrentMonth && 'text-foreground hover:bg-accent',
                          !isCurrentMonth && 'text-muted-foreground/40',
                        )}
                      >
                        {format(day, 'd')}
                      </button>

                      {/* Single-day events (below span area) */}
                      <div
                        className="flex flex-col gap-0.5"
                        style={{ marginTop: spanAreaHeight > 0 ? `${spanAreaHeight}px` : undefined }}
                      >
                        {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => (
                          <ScheduleEventItem
                            key={event.id}
                            event={event}
                            onClick={onEventClick}
                            compact
                          />
                        ))}
                        {dayEvents.length > MAX_VISIBLE_EVENTS && (
                          <span className="px-1 text-[11px] text-muted-foreground">
                            +{dayEvents.length - MAX_VISIBLE_EVENTS} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week Grid ───────────────────────────────────────────

const WEEK_SPAN_HEIGHT = 20;
const WEEK_SPAN_GAP = 2;

interface WeekGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick: (event: CalendarEvent) => void;
  onDayDoubleClick: (day: Date) => void;
  onEventDrop: (event: CalendarEvent, targetDay: Date) => void;
}

function WeekGrid({
  currentDate,
  events,
  onEventClick,
  onEventDoubleClick,
  onDayDoubleClick,
  onEventDrop,
}: WeekGridProps) {
  const days = getWeekDays(currentDate);

  // Compute span segments for multi-day events
  const spanSegments = useMemo(() => computeWeekSpanSegments(events, days), [events, days]);

  // Max lanes for all-day area height
  const maxLanes = useMemo(() => {
    let max = 0;
    for (const seg of spanSegments) {
      if (seg.lane + 1 > max) max = seg.lane + 1;
    }
    return max;
  }, [spanSegments]);

  // Set of multi-day event IDs (to exclude from single-day rendering)
  const multiDayIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (isMultiDayEvent(e)) set.add(e.id);
    }
    return set;
  }, [events]);

  // Drag-and-drop state
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const dragEventRef = useRef<CalendarEvent | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, event: CalendarEvent) => {
    dragEventRef.current = event;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', event.id);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '';
    }
    dragEventRef.current = null;
    setDragOverDay(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dayKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, day: Date) => {
    e.preventDefault();
    setDragOverDay(null);
    const event = dragEventRef.current;
    if (event) {
      onEventDrop(event, day);
      dragEventRef.current = null;
    }
  }, [onEventDrop]);

  const spanAreaHeight = maxLanes > 0 ? maxLanes * (WEEK_SPAN_HEIGHT + WEEK_SPAN_GAP) + 8 : 28;

  return (
    <div className="flex h-full flex-col">
      {/* Column headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
        <div />
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'flex flex-col items-center py-2',
                today && 'bg-primary/5',
              )}
            >
              <span className="text-xs text-muted-foreground">
                {format(day, 'EEE')}
              </span>
              <span
                className={cn(
                  'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm',
                  today && 'bg-primary text-primary-foreground font-medium',
                )}
              >
                {format(day, 'd')}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day events area with span bars */}
      <div className="relative border-b" style={{ minHeight: spanAreaHeight }}>
        <div className="grid grid-cols-[60px_repeat(7,1fr)] h-full">
          <div className="flex items-start justify-center pt-1 text-[10px] text-muted-foreground">
            All day
          </div>
          {days.map((day) => {
            const today = isToday(day);
            const dayKey = day.toISOString();
            // Single-day events for this column (exclude multi-day)
            const singleDayEvents = getEventsForDay(events, day).filter(
              (e) => !multiDayIds.has(e.id),
            );
            return (
              <div
                key={dayKey}
                className={cn(
                  'relative border-l p-0.5',
                  today && 'bg-primary/5',
                  dragOverDay === dayKey && 'bg-primary/10',
                )}
                onDoubleClick={() => onDayDoubleClick(day)}
                onDragOver={(e) => handleDragOver(e, dayKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
              >
                {/* Single-day events below span area */}
                <div
                  className="flex flex-col gap-0.5"
                  style={{ marginTop: maxLanes > 0 ? maxLanes * (WEEK_SPAN_HEIGHT + WEEK_SPAN_GAP) : 0 }}
                >
                  {singleDayEvents.slice(0, 2).map((event) => (
                    <ScheduleEventItem
                      key={event.id}
                      event={event}
                      onClick={onEventClick}
                      compact
                    />
                  ))}
                  {singleDayEvents.length > 2 && (
                    <span className="px-1 text-[10px] text-muted-foreground">
                      +{singleDayEvents.length - 2}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Multi-day span bars (absolute positioned) */}
        {spanSegments.map((seg) => {
          const top = 4 + seg.lane * (WEEK_SPAN_HEIGHT + WEEK_SPAN_GAP);

          return (
            <button
              key={`${seg.eventId}-week`}
              draggable
              onDragStart={(e) => handleDragStart(e, seg.event)}
              onDragEnd={handleDragEnd}
              className={cn(
                'absolute z-10 truncate px-1.5 text-xs text-white leading-5 cursor-grab active:cursor-grabbing',
                seg.isStart && seg.isEnd && 'rounded',
                seg.isStart && !seg.isEnd && 'rounded-l',
                !seg.isStart && seg.isEnd && 'rounded-r',
                !seg.isStart && !seg.isEnd && 'rounded-none',
                seg.event.isCompleted && 'opacity-50',
              )}
              style={{
                left: `calc(60px + ${(seg.startCol / 7)} * (100% - 60px))`,
                width: `calc(${(seg.endCol - seg.startCol + 1) / 7} * (100% - 60px))`,
                top: `${top}px`,
                height: `${WEEK_SPAN_HEIGHT}px`,
                backgroundColor: seg.event.color,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(seg.event);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onEventDoubleClick(seg.event);
              }}
              title={seg.event.title}
            >
              {seg.isStart && (
                <span className={cn('truncate', seg.event.isCompleted && 'line-through')}>
                  {seg.event.projectName && (
                    <span className="opacity-70 mr-1">{seg.event.projectName}</span>
                  )}
                  {seg.event.title}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {Array.from({ length: 24 }, (_, hour) => (
            <TimeRow
              key={hour}
              hour={hour}
              days={days}
              onDoubleClick={onDayDoubleClick}
              dragOverDay={dragOverDay}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TimeRowProps {
  hour: number;
  days: Date[];
  onDoubleClick: (day: Date) => void;
  dragOverDay?: string | null;
  onDragOver?: (e: React.DragEvent, dayKey: string) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, day: Date) => void;
}

function TimeRow({ hour, days, onDoubleClick, dragOverDay, onDragOver, onDragLeave, onDrop }: TimeRowProps) {
  const label = `${hour.toString().padStart(2, '0')}:00`;

  return (
    <>
      {/* Time label */}
      <div className="relative h-[60px] border-b pr-2 text-right">
        <span className="relative -top-2 text-[10px] text-muted-foreground">{label}</span>
      </div>
      {/* Day columns */}
      {days.map((day) => {
        const today = isToday(day);
        const dayKey = day.toISOString();
        return (
          <div
            key={dayKey}
            className={cn(
              'h-[60px] border-b border-l',
              today && 'bg-primary/5',
              hour >= 8 && hour < 18 ? '' : 'bg-muted/20',
              dragOverDay === dayKey && 'bg-primary/10',
            )}
            onDoubleClick={() => onDoubleClick(day)}
            onDragOver={(e) => onDragOver?.(e, dayKey)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop?.(e, day)}
          />
        );
      })}
    </>
  );
}

// ─── Day Grid ────────────────────────────────────────────

interface DayGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick?: (event: CalendarEvent) => void;
  onDoubleClick: () => void;
  onEventDrop?: (event: CalendarEvent, targetDay: Date) => void;
}

function DayGrid({
  currentDate,
  events,
  onEventClick,
  onDoubleClick,
}: DayGridProps) {
  const dayEvents = getEventsForDay(events, currentDate);
  const today = isToday(currentDate);

  return (
    <div className="flex h-full flex-col">
      {/* All-day events */}
      {dayEvents.length > 0 && (
        <div className="border-b p-2">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground">ALL DAY</div>
          <div className="flex flex-col gap-1">
            {dayEvents.map((event) => (
              <ScheduleEventItem
                key={event.id}
                event={event}
                onClick={onEventClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-[60px_1fr]">
          {Array.from({ length: 24 }, (_, hour) => {
            const label = `${hour.toString().padStart(2, '0')}:00`;
            return (
              <div key={hour} className="contents">
                <div className="relative h-[60px] border-b pr-2 text-right">
                  <span className="relative -top-2 text-[10px] text-muted-foreground">
                    {label}
                  </span>
                </div>
                <div
                  className={cn(
                    'h-[60px] border-b border-l',
                    today && 'bg-primary/5',
                    hour >= 8 && hour < 18 ? '' : 'bg-muted/20',
                  )}
                  onDoubleClick={onDoubleClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Event Item (replaces CalendarEventItem for schedules) ──

interface ScheduleEventItemProps {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent) => void;
  compact?: boolean;
}

function ScheduleEventItem({ event, onClick, compact = false }: ScheduleEventItemProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(event);
      }}
      className={cn(
        'group w-full truncate rounded px-1.5 text-left text-xs text-white transition-opacity',
        compact ? 'py-0.5' : 'py-0.5',
      )}
      style={{ backgroundColor: event.color }}
    >
      <span className="truncate">{event.title}</span>
    </button>
  );
}
