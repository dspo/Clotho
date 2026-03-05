import { useRef } from 'react';
import {
  ROW_HEIGHT,
  dateToX,
  getWeekendRanges,
  type ZoomLevel,
  type TimeRange,
  type PackedTask,
} from './gantt-utils';
import { GanttTaskBar } from './GanttTaskBar';
import { TaskContextMenu } from '@/components/task/TaskContextMenu';

interface PackedTaskWithColor extends PackedTask {
  taskColor: string;
  projectColor: string;
  projectName: string;
}

interface GanttTimelineProps {
  packedTasks: PackedTaskWithColor[];
  rowCount: number;
  timeRange: TimeRange;
  colWidth: number;
  zoomLevel: ZoomLevel;
  totalWidth: number;
  totalHeight: number;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onTaskDoubleClick: (id: string) => void;
  onDateChange: (taskId: string, startDate: string | null, dueDate: string | null) => void;
  onUnschedule?: (taskId: string) => void;
  onRowChange?: (taskId: string, newPackedRow: number) => void;
  projectRowCounts?: Map<string, number>;
  projectIds?: string[];
}

export function GanttTimeline({
  packedTasks,
  rowCount,
  timeRange,
  colWidth,
  zoomLevel,
  totalWidth,
  totalHeight,
  selectedTaskId,
  onSelectTask,
  onTaskDoubleClick,
  onDateChange,
  onUnschedule,
  onRowChange,
  projectRowCounts,
  projectIds,
}: GanttTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const weekendRanges = getWeekendRanges(timeRange, colWidth, zoomLevel);
  const todayX = dateToX(new Date(), timeRange, colWidth, zoomLevel);

  return (
    <svg
      ref={svgRef}
      width={totalWidth}
      height={totalHeight}
      className="block"
    >
      {/* Weekend backgrounds */}
      {weekendRanges.map((range, i) => (
        <rect
          key={`we-${i}`}
          x={range.x}
          y={0}
          width={range.width}
          height={totalHeight}
          className="fill-muted/30"
        />
      ))}

      {/* Today column highlight */}
      <rect
        x={todayX}
        y={0}
        width={colWidth}
        height={totalHeight}
        fill="#eff6ff"
        className="dark:fill-[#1e293b]"
        opacity={0.5}
      />

      {/* Grid lines (horizontal) */}
      {Array.from({ length: rowCount }, (_, i) => (
        <line
          key={`hl-${i}`}
          x1={0}
          y1={(i + 1) * ROW_HEIGHT}
          x2={totalWidth}
          y2={(i + 1) * ROW_HEIGHT}
          stroke="currentColor"
          strokeOpacity={0.06}
          strokeWidth={0.5}
        />
      ))}

      {/* Project boundary lines */}
      {projectRowCounts && projectIds && (() => {
        let offset = 0;
        return projectIds.map((pid) => {
          offset += (projectRowCounts.get(pid) ?? 3);
          const lineY = offset * ROW_HEIGHT;
          return (
            <line
              key={`pb-${pid}`}
              x1={0}
              y1={lineY}
              x2={totalWidth}
              y2={lineY}
              stroke="currentColor"
              strokeOpacity={0.15}
              strokeWidth={1}
            />
          );
        });
      })()}

      {/* Today line */}
      <line
        x1={todayX + colWidth / 2}
        y1={0}
        x2={todayX + colWidth / 2}
        y2={totalHeight}
        stroke="#ef4444"
        strokeWidth={1.5}
        strokeDasharray="4,2"
      />
      {/* Today triangle marker */}
      <polygon
        points={`${todayX + colWidth / 2 - 5},0 ${todayX + colWidth / 2 + 5},0 ${todayX + colWidth / 2},6`}
        fill="#ef4444"
      />

      {/* Task bars */}
      {packedTasks.map((pt) => {
        const y = pt.packedRow * ROW_HEIGHT;

        return (
          <TaskContextMenu key={pt.task.id} taskIdForCopy={pt.task.id}>
            <g>
              <GanttTaskBar
                task={pt.task}
                x={pt.barX}
                y={y}
                width={pt.barWidth}
                color={pt.taskColor}
                projectName={pt.projectName}
                timeRange={timeRange}
                colWidth={colWidth}
                zoomLevel={zoomLevel}
                selected={selectedTaskId === pt.task.id}
                onClick={() => onSelectTask(pt.task.id)}
                onDoubleClick={() => onTaskDoubleClick(pt.task.id)}
                onDateChange={onDateChange}
                onUnschedule={onUnschedule}
                onRowChange={onRowChange}
                totalPackedRows={rowCount}
              />
            </g>
          </TaskContextMenu>
        );
      })}
    </svg>
  );
}
