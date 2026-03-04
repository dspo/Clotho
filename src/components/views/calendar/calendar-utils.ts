import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameDay,
  isSameMonth,
  isToday,
  format,
  getDay,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { TaskWithTags } from '@/types/task';
import { generateTaskColor } from '@/lib/color';

export type CalendarViewMode = 'month' | 'week' | 'day';

export interface CalendarEvent {
  id: string;
  title: string;
  projectName: string;
  start: Date;
  end: Date;
  color: string;
  task: TaskWithTags;
  isCompleted: boolean;
}

/** Get the 6x7 grid days for a month view */
export function getMonthDays(date: Date): Date[] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Ensure exactly 42 days (6 rows)
  while (days.length < 42) {
    days.push(addDays(days[days.length - 1], 1));
  }

  return days;
}

/** Get the 7 days for a week view */
export function getWeekDays(date: Date): Date[] {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: weekStart, end: weekEnd });
}

/** Navigate forward based on view mode */
export function navigateForward(date: Date, mode: CalendarViewMode): Date {
  switch (mode) {
    case 'month':
      return addMonths(date, 1);
    case 'week':
      return addWeeks(date, 1);
    case 'day':
      return addDays(date, 1);
  }
}

/** Navigate backward based on view mode */
export function navigateBackward(date: Date, mode: CalendarViewMode): Date {
  switch (mode) {
    case 'month':
      return subMonths(date, 1);
    case 'week':
      return subWeeks(date, 1);
    case 'day':
      return subDays(date, 1);
  }
}

/** Format the date range title for toolbar display */
export function formatDateTitle(date: Date, mode: CalendarViewMode): string {
  switch (mode) {
    case 'month':
      return format(date, 'yyyy年M月', { locale: zhCN });
    case 'week': {
      const days = getWeekDays(date);
      const first = days[0];
      const last = days[6];
      if (isSameMonth(first, last)) {
        return `${format(first, 'yyyy年M月d日', { locale: zhCN })} - ${format(last, 'd日', { locale: zhCN })}`;
      }
      return `${format(first, 'M月d日', { locale: zhCN })} - ${format(last, 'M月d日', { locale: zhCN })}`;
    }
    case 'day':
      return format(date, 'yyyy年M月d日 EEEE', { locale: zhCN });
  }
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function getWeekdayLabels(): string[] {
  return WEEKDAY_LABELS;
}

/** Convert tasks to calendar events */
export function tasksToEvents(
  tasks: TaskWithTags[],
  projectColorMap: Map<string, string>,
  projectNameMap: Map<string, string>,
): CalendarEvent[] {
  // Track per-project task index for color variation
  const projectTaskIndex = new Map<string, number>();

  return tasks
    .filter((t) => t.due_date && t.status !== 'cancelled')
    .map((t) => {
      const end = new Date(t.due_date!);
      const start = t.start_date ? new Date(t.start_date) : end;
      const projectHex = projectColorMap.get(t.project_id) ?? '#3B82F6';
      const idx = projectTaskIndex.get(t.project_id) ?? 0;
      projectTaskIndex.set(t.project_id, idx + 1);
      return {
        id: t.id,
        title: t.title,
        projectName: projectNameMap.get(t.project_id) ?? '',
        start,
        end,
        color: generateTaskColor(projectHex, idx),
        task: t,
        isCompleted: t.status === 'done',
      };
    });
}

/** Get events for a specific day */
export function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => {
    // Event spans from start to end; check if day falls within range
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const eStart = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate());
    const eEnd = new Date(e.end.getFullYear(), e.end.getMonth(), e.end.getDate());
    return dayStart >= eStart && dayStart <= eEnd;
  });
}

/** Check if an event spans multiple days */
export function isMultiDayEvent(event: CalendarEvent): boolean {
  return !isSameDay(event.start, event.end);
}

export interface SpanSegment {
  eventId: string;
  row: number;
  startCol: number;
  endCol: number;
  lane: number;
  event: CalendarEvent;
  isStart: boolean;
  isEnd: boolean;
}

/** Compute span segments for multi-day events across a month grid (6 rows x 7 cols).
 *  Returns segments with lane assignments (vertical stacking within each row). */
export function computeSpanSegments(
  events: CalendarEvent[],
  days: Date[],
): SpanSegment[] {
  const multiDayEvents = events.filter(isMultiDayEvent);
  // Sort by duration descending (longer events get earlier lanes), then by start date
  multiDayEvents.sort((a, b) => {
    const durA = a.end.getTime() - a.start.getTime();
    const durB = b.end.getTime() - b.start.getTime();
    if (durB !== durA) return durB - durA;
    return a.start.getTime() - b.start.getTime();
  });

  const gridStart = days[0];
  const gridEnd = days[days.length - 1];

  const segments: SpanSegment[] = [];
  // Track lane assignments per row: row -> array of occupied [startCol, endCol] per lane
  const rowLanes: Map<number, Array<Array<[number, number]>>> = new Map();

  for (const event of multiDayEvents) {
    // Clamp event to grid range
    const eStart = event.start < gridStart ? gridStart : event.start;
    const eEnd = event.end > gridEnd ? gridEnd : event.end;

    const startIdx = dayIndex(eStart, gridStart);
    const endIdx = dayIndex(eEnd, gridStart);
    if (startIdx < 0 || endIdx < 0) continue;

    // Split into per-row segments
    const startRow = Math.floor(startIdx / 7);
    const endRow = Math.floor(endIdx / 7);

    // We need to find a consistent lane across all rows this event spans
    // First, collect segments, then assign lanes
    const eventSegments: Array<{ row: number; startCol: number; endCol: number }> = [];
    for (let row = startRow; row <= endRow; row++) {
      const segStartCol = row === startRow ? startIdx % 7 : 0;
      const segEndCol = row === endRow ? endIdx % 7 : 6;
      eventSegments.push({ row, startCol: segStartCol, endCol: segEndCol });
    }

    // Find first lane that works across all segments for this event
    let lane = 0;
    while (true) {
      let fits = true;
      for (const seg of eventSegments) {
        const lanes = rowLanes.get(seg.row) ?? [];
        if (lane < lanes.length) {
          for (const [occStart, occEnd] of lanes[lane]) {
            if (seg.startCol <= occEnd && seg.endCol >= occStart) {
              fits = false;
              break;
            }
          }
        }
        if (!fits) break;
      }
      if (fits) break;
      lane++;
    }

    // Reserve the lane
    for (const seg of eventSegments) {
      if (!rowLanes.has(seg.row)) rowLanes.set(seg.row, []);
      const lanes = rowLanes.get(seg.row)!;
      while (lanes.length <= lane) lanes.push([]);
      lanes[lane].push([seg.startCol, seg.endCol]);
    }

    // Create segments
    for (const seg of eventSegments) {
      segments.push({
        eventId: event.id,
        row: seg.row,
        startCol: seg.startCol,
        endCol: seg.endCol,
        lane,
        event,
        isStart: seg.row === startRow && event.start >= gridStart,
        isEnd: seg.row === endRow && event.end <= gridEnd,
      });
    }
  }

  return segments;
}

/** Get the maximum lane count for a given row */
export function getMaxLaneForRow(segments: SpanSegment[], row: number): number {
  let max = -1;
  for (const seg of segments) {
    if (seg.row === row && seg.lane > max) max = seg.lane;
  }
  return max + 1; // count
}

/** Get the day index in the grid (0-based) for a date */
function dayIndex(date: Date, gridStart: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const g = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate());
  const diff = Math.round((d.getTime() - g.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

/** Get the priority dot color */
export function getPriorityColor(priority: string): string | null {
  switch (priority) {
    case 'urgent':
      return '#EF4444';
    case 'high':
      return '#F97316';
    case 'medium':
      return '#EAB308';
    default:
      return null;
  }
}

export { isSameDay, isSameMonth, isToday, format, getDay };

/** Compute span segments for multi-day events across a week grid (1 row x 7 cols).
 *  Similar to month grid but single row, simpler logic. */
export function computeWeekSpanSegments(
  events: CalendarEvent[],
  days: Date[],
): SpanSegment[] {
  const multiDayEvents = events.filter(isMultiDayEvent);
  // Sort by duration descending, then by start date
  multiDayEvents.sort((a, b) => {
    const durA = a.end.getTime() - a.start.getTime();
    const durB = b.end.getTime() - b.start.getTime();
    if (durB !== durA) return durB - durA;
    return a.start.getTime() - b.start.getTime();
  });

  const gridStart = days[0];
  const gridEnd = days[days.length - 1];

  const segments: SpanSegment[] = [];
  // Track lane assignments: array of occupied [startCol, endCol] per lane
  const lanes: Array<Array<[number, number]>> = [];

  for (const event of multiDayEvents) {
    // Clamp event to grid range
    const eStart = event.start < gridStart ? gridStart : event.start;
    const eEnd = event.end > gridEnd ? gridEnd : event.end;

    const startIdx = dayIndex(eStart, gridStart);
    const endIdx = dayIndex(eEnd, gridStart);
    if (startIdx < 0 || endIdx < 0 || startIdx > 6 || endIdx > 6) continue;

    // Find first available lane
    let lane = 0;
    while (true) {
      let fits = true;
      if (lane < lanes.length) {
        for (const [occStart, occEnd] of lanes[lane]) {
          if (startIdx <= occEnd && endIdx >= occStart) {
            fits = false;
            break;
          }
        }
      }
      if (fits) break;
      lane++;
    }

    // Reserve the lane
    while (lanes.length <= lane) lanes.push([]);
    lanes[lane].push([startIdx, endIdx]);

    segments.push({
      eventId: event.id,
      row: 0,
      startCol: startIdx,
      endCol: endIdx,
      lane,
      event,
      isStart: event.start >= gridStart,
      isEnd: event.end <= gridEnd,
    });
  }

  return segments;
}
