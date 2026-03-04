import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  differenceInCalendarDays,
  format,
  isWeekend,
  getWeek,
  getQuarter,
  min as dateMin,
  max as dateMax,
  parseISO,
} from 'date-fns';
import type { TaskWithTags } from '@/types/task';

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export interface GanttConfig {
  zoomLevel: ZoomLevel;
  colWidth: number;
  rowHeight: number;
  headerHeight: number;
  barHeight: number;
  barTopOffset: number;
  minBarWidth: number;
}

export const ZOOM_CONFIGS: Record<ZoomLevel, { colWidth: number; label: string }> = {
  day: { colWidth: 40, label: 'Day' },
  week: { colWidth: 80, label: 'Week' },
  month: { colWidth: 120, label: 'Month' },
  quarter: { colWidth: 160, label: 'Quarter' },
};

export const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];

export const ROW_HEIGHT = 36;
export const HEADER_HEIGHT = 48;
export const BAR_HEIGHT = 24;
export const BAR_TOP_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2; // 6
export const MIN_BAR_WIDTH = 8;

export function getGanttConfig(zoomLevel: ZoomLevel): GanttConfig {
  return {
    zoomLevel,
    colWidth: ZOOM_CONFIGS[zoomLevel].colWidth,
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    barHeight: BAR_HEIGHT,
    barTopOffset: BAR_TOP_OFFSET,
    minBarWidth: MIN_BAR_WIDTH,
  };
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export function computeTimeRange(tasks: TaskWithTags[], zoomLevel: ZoomLevel): TimeRange {
  const datesWithValues = tasks
    .flatMap((t) => [t.start_date, t.due_date])
    .filter((d): d is string => d !== null)
    .map((d) => parseISO(d));

  if (datesWithValues.length === 0) {
    const today = new Date();
    return { start: addDays(today, -14), end: addDays(today, 30) };
  }

  const today = new Date();
  let rangeStart: Date;
  let rangeEnd: Date;

  // Add padding based on zoom level
  switch (zoomLevel) {
    case 'day':
      rangeStart = addDays(today, -1);
      rangeEnd = addDays(today, 14);
      break;
    case 'week':
      rangeStart = startOfWeek(addWeeks(dateMin(datesWithValues), -2), { weekStartsOn: 1 });
      rangeEnd = endOfWeek(addWeeks(dateMax(datesWithValues), 4), { weekStartsOn: 1 });
      break;
    case 'month':
      rangeStart = startOfMonth(addMonths(dateMin(datesWithValues), -1));
      rangeEnd = endOfMonth(addMonths(dateMax(datesWithValues), 2));
      break;
    case 'quarter':
      rangeStart = startOfQuarter(addQuarters(dateMin(datesWithValues), -1));
      rangeEnd = endOfQuarter(addQuarters(dateMax(datesWithValues), 1));
      break;
  }

  return { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) };
}

export const MIN_COL_WIDTH = 40;

export function computeDayColWidth(viewportWidth: number, leftPanelWidth: number, timeRange: TimeRange): number {
  const totalDays = differenceInCalendarDays(timeRange.end, timeRange.start) + 1;
  if (totalDays <= 0) return MIN_COL_WIDTH;
  const available = viewportWidth - leftPanelWidth;
  return Math.max(MIN_COL_WIDTH, Math.floor(available / totalDays));
}

export function dateToX(date: Date, timeRange: TimeRange, colWidth: number, zoomLevel: ZoomLevel): number {
  const dayOffset = differenceInCalendarDays(date, timeRange.start);

  switch (zoomLevel) {
    case 'day':
      return dayOffset * colWidth;
    case 'week':
      return (dayOffset / 7) * colWidth;
    case 'month':
      return (dayOffset / 30) * colWidth;
    case 'quarter':
      return (dayOffset / 90) * colWidth;
  }
}

export function xToDate(x: number, timeRange: TimeRange, colWidth: number, zoomLevel: ZoomLevel): Date {
  let dayOffset: number;
  switch (zoomLevel) {
    case 'day':
      dayOffset = Math.round(x / colWidth);
      break;
    case 'week':
      dayOffset = Math.round((x / colWidth) * 7);
      break;
    case 'month':
      dayOffset = Math.round((x / colWidth) * 30);
      break;
    case 'quarter':
      dayOffset = Math.round((x / colWidth) * 90);
      break;
  }
  return addDays(timeRange.start, dayOffset);
}

export function getTotalWidth(timeRange: TimeRange, colWidth: number, zoomLevel: ZoomLevel): number {
  const totalDays = differenceInCalendarDays(timeRange.end, timeRange.start) + 1;
  switch (zoomLevel) {
    case 'day':
      return totalDays * colWidth;
    case 'week':
      return Math.ceil(totalDays / 7) * colWidth;
    case 'month':
      return Math.ceil(totalDays / 30) * colWidth;
    case 'quarter':
      return Math.ceil(totalDays / 90) * colWidth;
  }
}

export interface HeaderCell {
  label: string;
  x: number;
  width: number;
}

export function getHeaderCells(
  timeRange: TimeRange,
  colWidth: number,
  zoomLevel: ZoomLevel,
): { topRow: HeaderCell[]; bottomRow: HeaderCell[] } {
  const topRow: HeaderCell[] = [];
  const bottomRow: HeaderCell[] = [];
  let current = new Date(timeRange.start);

  switch (zoomLevel) {
    case 'day': {
      let lastMonth = '';
      while (current <= timeRange.end) {
        const x = dateToX(current, timeRange, colWidth, zoomLevel);
        const monthLabel = format(current, 'MMM yyyy');
        if (monthLabel !== lastMonth) {
          // Count days in this month within range
          let daysInGroup = 0;
          const checkDate = new Date(current);
          while (checkDate <= timeRange.end && format(checkDate, 'MMM yyyy') === monthLabel) {
            daysInGroup++;
            checkDate.setDate(checkDate.getDate() + 1);
          }
          topRow.push({ label: monthLabel, x, width: daysInGroup * colWidth });
          lastMonth = monthLabel;
        }
        bottomRow.push({ label: format(current, 'd'), x, width: colWidth });
        current = addDays(current, 1);
      }
      break;
    }
    case 'week': {
      let lastMonth = '';
      while (current <= timeRange.end) {
        const weekStart = startOfWeek(current, { weekStartsOn: 1 });
        const x = dateToX(weekStart, timeRange, colWidth, zoomLevel);
        const monthLabel = format(current, 'MMM yyyy');
        if (monthLabel !== lastMonth) {
          let weeksInGroup = 0;
          const checkDate = new Date(current);
          while (checkDate <= timeRange.end && format(checkDate, 'MMM yyyy') === monthLabel) {
            weeksInGroup++;
            checkDate.setDate(checkDate.getDate() + 7);
          }
          topRow.push({ label: monthLabel, x, width: weeksInGroup * colWidth });
          lastMonth = monthLabel;
        }
        bottomRow.push({ label: `W${getWeek(current, { weekStartsOn: 1 })}`, x, width: colWidth });
        current = addWeeks(current, 1);
      }
      break;
    }
    case 'month': {
      let lastYear = '';
      while (current <= timeRange.end) {
        const x = dateToX(startOfMonth(current), timeRange, colWidth, zoomLevel);
        const yearLabel = format(current, 'yyyy');
        if (yearLabel !== lastYear) {
          let monthsInGroup = 0;
          const checkDate = new Date(current);
          while (checkDate <= timeRange.end && format(checkDate, 'yyyy') === yearLabel) {
            monthsInGroup++;
            checkDate.setMonth(checkDate.getMonth() + 1);
          }
          topRow.push({ label: yearLabel, x, width: monthsInGroup * colWidth });
          lastYear = yearLabel;
        }
        bottomRow.push({ label: format(current, 'MMM'), x, width: colWidth });
        current = addMonths(current, 1);
      }
      break;
    }
    case 'quarter': {
      let lastYear = '';
      while (current <= timeRange.end) {
        const x = dateToX(startOfQuarter(current), timeRange, colWidth, zoomLevel);
        const yearLabel = format(current, 'yyyy');
        if (yearLabel !== lastYear) {
          let quartersInGroup = 0;
          const checkDate = new Date(current);
          while (checkDate <= timeRange.end && format(checkDate, 'yyyy') === yearLabel) {
            quartersInGroup++;
            checkDate.setMonth(checkDate.getMonth() + 3);
          }
          topRow.push({ label: yearLabel, x, width: quartersInGroup * colWidth });
          lastYear = yearLabel;
        }
        bottomRow.push({ label: `Q${getQuarter(current)}`, x, width: colWidth });
        current = addQuarters(current, 1);
      }
      break;
    }
  }

  return { topRow, bottomRow };
}

export function getWeekendRanges(timeRange: TimeRange, colWidth: number, zoomLevel: ZoomLevel): { x: number; width: number }[] {
  if (zoomLevel !== 'day') return [];
  const ranges: { x: number; width: number }[] = [];
  let current = new Date(timeRange.start);
  while (current <= timeRange.end) {
    if (isWeekend(current)) {
      ranges.push({
        x: dateToX(current, timeRange, colWidth, zoomLevel),
        width: colWidth,
      });
    }
    current = addDays(current, 1);
  }
  return ranges;
}

/** Minimum horizontal gap (in pixels) between tasks on the same packed row */
const PACK_GAP = 4;

export interface PackedTask {
  task: TaskWithTags;
  barX: number;
  barWidth: number;
  packedRow: number;
}

/** Minimum rows each project occupies in the Gantt chart */
export const MIN_PROJECT_ROWS = 3;

/**
 * Pack tasks into rows per project so that the left-side project list heights
 * align with the right-side task area. Non-overlapping tasks within the same
 * project share the same row. Projects are stacked vertically.
 *
 * Returns packed tasks with global row indices, the total row count,
 * and a map of how many rows each project occupies.
 */
export function packTaskRows(
  tasks: TaskWithTags[],
  timeRange: TimeRange,
  colWidth: number,
  zoomLevel: ZoomLevel,
  projectIds?: string[],
): { packed: PackedTask[]; rowCount: number; projectRowCounts: Map<string, number> } {
  // Group tasks by project
  const tasksByProject = new Map<string, TaskWithTags[]>();
  for (const task of tasks) {
    const list = tasksByProject.get(task.project_id) ?? [];
    list.push(task);
    tasksByProject.set(task.project_id, list);
  }

  // Determine project order: use provided projectIds or collect from tasks
  const orderedProjectIds = projectIds ?? [...tasksByProject.keys()];

  const packed: PackedTask[] = [];
  const projectRowCounts = new Map<string, number>();
  let globalRowOffset = 0;

  for (const projectId of orderedProjectIds) {
    const projectTasks = tasksByProject.get(projectId) ?? [];

    // Compute bar positions for each task in this project
    const items: { task: TaskWithTags; barX: number; barEndX: number; barWidth: number }[] = [];

    for (const task of projectTasks) {
      const effectiveStart = task.start_date ?? task.due_date;
      const effectiveEnd = task.due_date ?? task.start_date;
      if (!effectiveStart || !effectiveEnd) {
        continue;
      }

      const startDate = parseISO(effectiveStart);
      const endDatePlusOne = new Date(parseISO(effectiveEnd));
      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);

      const barX = dateToX(startDate, timeRange, colWidth, zoomLevel);
      const barEndX = dateToX(endDatePlusOne, timeRange, colWidth, zoomLevel);
      const barWidth = Math.max(barEndX - barX, MIN_BAR_WIDTH);

      items.push({ task, barX, barEndX: barX + barWidth, barWidth });
    }

    // Sort by barX (start position)
    items.sort((a, b) => a.barX - b.barX);

    // Greedy row packing within this project
    const rowEnds: number[] = [];

    for (const item of items) {
      let placed = false;
      for (let r = 0; r < rowEnds.length; r++) {
        if (item.barX >= rowEnds[r] + PACK_GAP) {
          rowEnds[r] = item.barEndX;
          packed.push({
            task: item.task,
            barX: item.barX,
            barWidth: item.barWidth,
            packedRow: globalRowOffset + r,
          });
          placed = true;
          break;
        }
      }
      if (!placed) {
        rowEnds.push(item.barEndX);
        packed.push({
          task: item.task,
          barX: item.barX,
          barWidth: item.barWidth,
          packedRow: globalRowOffset + rowEnds.length - 1,
        });
      }
    }

    const scheduledRows = Math.max(rowEnds.length, MIN_PROJECT_ROWS);
    projectRowCounts.set(projectId, scheduledRows);
    globalRowOffset += scheduledRows;
  }

  return { packed, rowCount: Math.max(globalRowOffset, 1), projectRowCounts };
}

export function getTaskBarPosition(
  task: TaskWithTags,
  timeRange: TimeRange,
  colWidth: number,
  zoomLevel: ZoomLevel,
  rowIndex: number,
): { x: number; y: number; width: number } | null {
  const startStr = task.start_date ?? (task.due_date ? addDays(parseISO(task.due_date), -1).toISOString() : null);
  const endStr = task.due_date ?? task.start_date;

  if (!startStr && !endStr) return null;

  const start = parseISO(startStr!);
  const end = parseISO(endStr!);

  const x = dateToX(start, timeRange, colWidth, zoomLevel);
  const endX = dateToX(addDays(end, 1), timeRange, colWidth, zoomLevel);
  const width = Math.max(endX - x, MIN_BAR_WIDTH);

  return {
    x,
    y: rowIndex * ROW_HEIGHT,
    width,
  };
}
