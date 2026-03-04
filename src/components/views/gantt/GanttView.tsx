import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useTaskStore } from '@/stores/task-store';
import { useProjectStore } from '@/stores/project-store';
import { useUIStore } from '@/stores/ui-store';
import { useTagStore } from '@/stores/tag-store';
import { useSettingsStore } from '@/stores/settings-store';
import { GanttToolbar } from './GanttToolbar';
import { GanttTimelineHeader } from './GanttTimelineHeader';
import { GanttTimeline } from './GanttTimeline';
import { GanttProjectListBody } from './GanttProjectList';
import { TaskCreateDialog } from '@/components/task/TaskCreateDialog';
import {
  ZOOM_ORDER,
  ZOOM_CONFIGS,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  computeTimeRange,
  computeDayColWidth,
  dateToX,
  getTotalWidth,
  getHeaderCells,
  packTaskRows,
  type ZoomLevel,
  type TimeRange,
} from './gantt-utils';
import { generateTaskColor } from '@/lib/color';
import {
  startOfWeek,
  endOfWeek,
  addDays,
  startOfMonth,
  endOfMonth,
} from 'date-fns';

const LEFT_PANEL_WIDTH = 280;

export function GanttView() {
  const allTasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const createTask = useTaskStore((s) => s.createTask);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask);

  const projects = useProjectStore((s) => s.projects);
  const selectedProjectIds = useUIStore((s) => s.selectedProjectIds);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);

  const tags = useTagStore((s) => s.tags);
  const fetchTags = useTagStore((s) => s.fetchTags);

  const ganttDatePreset = useSettingsStore((s) => s.ganttDatePreset);
  const setGanttDatePreset = useSettingsStore((s) => s.setGanttDatePreset);

  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForProjectId, setCreateForProjectId] = useState<string | undefined>(undefined);

  // Single scroll container for horizontal + vertical scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  // Sticky timeline header that mirrors horizontal scroll
  const timelineHeaderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    fetchTasks();
    fetchTags();
  }, [fetchTasks, fetchTags]);

  // Apply persisted date preset on mount
  useEffect(() => {
    if (ganttDatePreset) {
      const today = new Date();
      let start: Date;
      let end: Date;
      if (ganttDatePreset === 'this_week') {
        start = startOfWeek(today, { weekStartsOn: 1 });
        end = endOfWeek(today, { weekStartsOn: 1 });
      } else if (ganttDatePreset === 'this_fortnight') {
        start = startOfWeek(today, { weekStartsOn: 1 });
        end = addDays(endOfWeek(today, { weekStartsOn: 1 }), 7);
      } else {
        start = startOfMonth(today);
        end = endOfMonth(today);
      }
      setDateRange({ start, end });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track container width for adaptive column sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Filter tasks by selected projects
  const tasks = useMemo(
    () => allTasks.filter((t) => selectedProjectIds.includes(t.project_id)),
    [allTasks, selectedProjectIds],
  );

  // Filter projects by selected project IDs
  const selectedProjects = useMemo(
    () => projects.filter((p) => selectedProjectIds.includes(p.id)),
    [projects, selectedProjectIds],
  );

  // Build project color map
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.color);
    }
    return map;
  }, [projects]);

  // Build project name map
  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projects]);

  // Compute time range - use user-specified range if available
  const timeRange: TimeRange = useMemo(() => {
    const computed = computeTimeRange(tasks, zoomLevel);
    if (dateRange.start && dateRange.end) {
      return { start: dateRange.start, end: dateRange.end };
    }
    return computed;
  }, [tasks, zoomLevel, dateRange]);

  // Adaptive column width for day zoom
  const colWidth = useMemo(() => {
    if (zoomLevel === 'day' && containerWidth > 0) {
      return computeDayColWidth(containerWidth, LEFT_PANEL_WIDTH, timeRange);
    }
    return ZOOM_CONFIGS[zoomLevel].colWidth;
  }, [zoomLevel, containerWidth, timeRange]);

  // Pack tasks into rows per project (non-overlapping tasks share the same row)
  const selectedProjectIdList = useMemo(
    () => selectedProjects.map((p) => p.id),
    [selectedProjects],
  );
  const { packed: packedTasks, rowCount, projectRowCounts } = useMemo(
    () => packTaskRows(tasks, timeRange, colWidth, zoomLevel, selectedProjectIdList),
    [tasks, timeRange, colWidth, zoomLevel, selectedProjectIdList],
  );

  // Add task colors based on project
  const packedTasksWithColors = useMemo(() => {
    const taskIndexByProject = new Map<string, number>();
    return packedTasks.map((pt) => {
      const projectId = pt.task.project_id;
      const projectColor = projectColorMap.get(projectId) ?? '#3B82F6';
      const idx = taskIndexByProject.get(projectId) ?? 0;
      taskIndexByProject.set(projectId, idx + 1);
      const taskColor = generateTaskColor(projectColor, idx);
      const projectName = projectNameMap.get(projectId) ?? 'Unknown';
      return { ...pt, taskColor, projectColor, projectName };
    });
  }, [packedTasks, projectColorMap, projectNameMap]);

  const totalWidth = useMemo(
    () => getTotalWidth(timeRange, colWidth, zoomLevel),
    [timeRange, colWidth, zoomLevel],
  );
  const { topRow, bottomRow } = useMemo(
    () => getHeaderCells(timeRange, colWidth, zoomLevel),
    [timeRange, colWidth, zoomLevel],
  );
  const totalHeight = rowCount * ROW_HEIGHT;

  const handleZoomIn = useCallback(() => {
    const idx = ZOOM_ORDER.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(ZOOM_ORDER[idx - 1]);
  }, [zoomLevel]);

  const handleZoomOut = useCallback(() => {
    const idx = ZOOM_ORDER.indexOf(zoomLevel);
    if (idx < ZOOM_ORDER.length - 1) setZoomLevel(ZOOM_ORDER[idx + 1]);
  }, [zoomLevel]);

  const handleToday = useCallback(() => {
    if (!scrollRef.current) return;
    const todayX = dateToX(new Date(), timeRange, colWidth, zoomLevel);
    const visibleWidth = scrollRef.current.clientWidth - LEFT_PANEL_WIDTH;
    scrollRef.current.scrollLeft = todayX - visibleWidth / 2 + LEFT_PANEL_WIDTH;
  }, [timeRange, colWidth, zoomLevel]);

  const handleFitAll = useCallback(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = 0;
  }, []);

  const handleDateChange = useCallback(
    async (taskId: string, startDate: string | null, dueDate: string | null) => {
      await updateTask(taskId, { start_date: startDate, due_date: dueDate });
    },
    [updateTask],
  );

  const handleUnschedule = useCallback(
    async (taskId: string) => {
      await updateTask(taskId, { start_date: null, due_date: null });
    },
    [updateTask],
  );

  const handleTaskDoubleClick = useCallback(
    (taskId: string) => {
      setSelectedTask(taskId);
      openDetailPanel(taskId);
    },
    [setSelectedTask, openDetailPanel],
  );

  // Sync timeline header horizontal scroll with the main scroll container
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !timelineHeaderRef.current) return;
    timelineHeaderRef.current.scrollLeft = scrollRef.current.scrollLeft;
  }, []);

  const handleDateRangeChange = useCallback(
    (start: Date | null, end: Date | null) => {
      setDateRange({ start, end });
      if (start && scrollRef.current) {
        const startX = dateToX(start, timeRange, colWidth, zoomLevel);
        scrollRef.current.scrollLeft = startX + LEFT_PANEL_WIDTH;
      }
    },
    [timeRange, colWidth, zoomLevel],
  );

  // Ctrl+scroll to zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setZoomLevel((prev) => {
            const idx = ZOOM_ORDER.indexOf(prev);
            return idx > 0 ? ZOOM_ORDER[idx - 1] : prev;
          });
        } else {
          setZoomLevel((prev) => {
            const idx = ZOOM_ORDER.indexOf(prev);
            return idx < ZOOM_ORDER.length - 1 ? ZOOM_ORDER[idx + 1] : prev;
          });
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleRowChange = useCallback(
    (_taskId: string, _newRow: number) => {},
    [],
  );

  const handleNewTask = useCallback((projectId: string) => {
    setCreateForProjectId(projectId);
    setCreateDialogOpen(true);
  }, []);

  const handleCreateDialogOpenChange = useCallback((open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) setCreateForProjectId(undefined);
  }, []);

  const defaultProjectId = createForProjectId ?? selectedProjectIds[0] ?? projects.find((p) => p.status === 'active')?.id ?? '';

  return (
    <div ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden">
      <GanttToolbar
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToday={handleToday}
        onFitAll={handleFitAll}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        datePreset={ganttDatePreset}
        onDatePresetChange={setGanttDatePreset}
      />

      {/* Sticky column headers (left panel header + timeline header) */}
      <div className="flex shrink-0 border-b">
        {/* Left panel header - fixed width, matches left panel body below */}
        <div
          className="shrink-0 border-r flex items-center bg-muted/50 text-xs font-medium text-muted-foreground px-2"
          style={{ width: LEFT_PANEL_WIDTH, height: HEADER_HEIGHT }}
        >
          <span className="flex-1">Project</span>
        </div>

        {/* Timeline header - mirrors horizontal scroll */}
        <div
          ref={timelineHeaderRef}
          className="flex-1 overflow-hidden"
        >
          <GanttTimelineHeader
            topRow={topRow}
            bottomRow={bottomRow}
            totalWidth={totalWidth}
          />
        </div>
      </div>

      {/*
        Single scrollable body — handles both horizontal and vertical scroll.
        The left panel (project list) is rendered as a sticky-left column inside
        the scroll container so it always stays aligned with the timeline rows.
      */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {/* Inner container: left panel + timeline side by side, full combined width */}
        <div
          className="relative flex"
          style={{ width: LEFT_PANEL_WIDTH + totalWidth, minHeight: totalHeight }}
        >
          {/* Left panel body — sticky on the left axis */}
          <div
            className="sticky left-0 z-10 shrink-0 border-r bg-background"
            style={{ width: LEFT_PANEL_WIDTH }}
          >
            <GanttProjectListBody
              projects={selectedProjects}
              tasks={tasks}
              hoveredProjectId={hoveredProjectId}
              onProjectHover={setHoveredProjectId}
              projectRowCounts={projectRowCounts}
              onNewTask={handleNewTask}
            />
          </div>

          {/* Timeline body */}
          <div style={{ width: totalWidth, minHeight: totalHeight }}>
            <GanttTimeline
              packedTasks={packedTasksWithColors}
              rowCount={rowCount}
              timeRange={timeRange}
              colWidth={colWidth}
              zoomLevel={zoomLevel}
              totalWidth={totalWidth}
              totalHeight={totalHeight}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTask}
              onTaskDoubleClick={handleTaskDoubleClick}
              onDateChange={handleDateChange}
              onUnschedule={handleUnschedule}
              onRowChange={handleRowChange}
              projectRowCounts={projectRowCounts}
              projectIds={selectedProjectIdList}
            />
          </div>
        </div>
      </div>

      {defaultProjectId && (
        <TaskCreateDialog
          open={createDialogOpen}
          onOpenChange={handleCreateDialogOpenChange}
          onSubmit={(input) => createTask(input)}
          projectId={defaultProjectId}
          allTags={tags}
        />
      )}
    </div>
  );
}
