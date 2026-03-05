import { useCallback, useId, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format, addDays } from 'date-fns';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  BAR_HEIGHT,
  BAR_TOP_OFFSET,
  MIN_BAR_WIDTH,
  ROW_HEIGHT,
  xToDate,
  type ZoomLevel,
  type TimeRange,
} from './gantt-utils';
import { softenHexColor } from '@/lib/color';
import type { TaskWithTags } from '@/types/task';

interface GanttTaskBarProps {
  task: TaskWithTags;
  x: number;
  y: number;
  width: number;
  color: string;
  projectName?: string;
  timeRange: TimeRange;
  colWidth: number;
  zoomLevel: ZoomLevel;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDateChange?: (taskId: string, startDate: string | null, dueDate: string | null) => void;
  onUnschedule?: (taskId: string) => void;
  onRowChange?: (taskId: string, newPackedRow: number) => void;
  totalPackedRows?: number;
}

type DragMode = 'move' | 'resize-left' | 'resize-right';

function truncateWithEllipsis(text: string, maxChars: number): string {
  if (maxChars <= 1) return '…';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(maxChars - 1, 1)).trimEnd()}…`;
}


export function GanttTaskBar({
  task,
  x,
  y,
  width,
  color,
  projectName,
  timeRange,
  colWidth,
  zoomLevel,
  selected,
  onClick,
  onDoubleClick,
  onDateChange,
  onUnschedule,
  onRowChange,
  totalPackedRows,
}: GanttTaskBarProps) {
  const clipId = useId();
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const barRef = useRef<SVGRectElement>(null);

  const [dragState, setDragState] = useState<{
    mode: DragMode;
    startMouseX: number;
    startMouseY: number;
    originalX: number;
    originalY: number;
    originalWidth: number;
    currentX: number;
    currentY: number;
    currentWidth: number;
    overUnscheduled: boolean;
  } | null>(null);

  const barY = y + BAR_TOP_OFFSET;
  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';
  const isTodo = task.status === 'todo';
  const isInProgress = task.status === 'in_progress';
  const isActiveStatus = isTodo || isInProgress;
  const barColor = softenHexColor(color);
  const gradientId = `gradient-${clipId}`;

  // Show name in bar if wide enough
  const showNameInBar = width >= 50;
  // Show name on right side if bar is too narrow
  const showNameOnRight = !showNameInBar && width >= MIN_BAR_WIDTH;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: DragMode) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      setShowTooltip(false);
      setDragState({
        mode,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        originalX: x,
        originalY: y,
        originalWidth: width,
        currentX: x,
        currentY: y,
        currentWidth: width,
        overUnscheduled: false,
      });
    },
    [x, y, width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startMouseX;
      const dy = e.clientY - dragState.startMouseY;

      let newX = dragState.originalX;
      let newY = dragState.originalY;
      let newWidth = dragState.originalWidth;

      switch (dragState.mode) {
        case 'move':
          newX = dragState.originalX + dx;
          // Snap Y to row grid
          newY = dragState.originalY + dy;
          if (newX >= 0) {
            const snappedRow = Math.round(newY / ROW_HEIGHT);
            const maxRow = (totalPackedRows ?? 1) - 1;
            const clampedRow = Math.max(0, Math.min(snappedRow, maxRow));
            newY = clampedRow * ROW_HEIGHT;
          }
          break;
        case 'resize-left':
          newX = dragState.originalX + dx;
          newWidth = dragState.originalWidth - dx;
          if (newWidth < MIN_BAR_WIDTH) {
            newX = dragState.originalX + dragState.originalWidth - MIN_BAR_WIDTH;
            newWidth = MIN_BAR_WIDTH;
          }
          break;
        case 'resize-right':
          newWidth = Math.max(dragState.originalWidth + dx, MIN_BAR_WIDTH);
          break;
      }

      // Dragging past the left edge of the timeline triggers unschedule
      const overUnscheduled = dragState.mode === 'move' && newX < 0;

      setDragState({ ...dragState, currentX: newX, currentY: newY, currentWidth: newWidth, overUnscheduled });
    },
    [dragState, totalPackedRows],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent) => {
      if (!dragState) {
        setDragState(null);
        return;
      }

      // If dragged past the left edge, unschedule
      if (dragState.overUnscheduled && onUnschedule) {
        onUnschedule(task.id);
        setDragState(null);
        return;
      }

      // Handle row change for move mode
      if (dragState.mode === 'move' && onRowChange) {
        const newRow = Math.round(dragState.currentY / ROW_HEIGHT);
        const originalRow = Math.round(dragState.originalY / ROW_HEIGHT);
        if (newRow !== originalRow) {
          onRowChange(task.id, newRow);
        }
      }

      if (onDateChange) {
        const newStart = xToDate(dragState.currentX, timeRange, colWidth, zoomLevel);
        const endX = dragState.currentX + dragState.currentWidth;
        const newEnd = addDays(xToDate(endX, timeRange, colWidth, zoomLevel), -1);

        onDateChange(
          task.id,
          format(newStart, 'yyyy-MM-dd'),
          format(newEnd, 'yyyy-MM-dd'),
        );
      }

      setDragState(null);
    },
    [dragState, onDateChange, onUnschedule, onRowChange, task.id, timeRange, colWidth, zoomLevel],
  );

  const handleMouseEnter = useCallback(() => {
    if (dragState) return;
    if (barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left,
        y: rect.top,
      });
    }
    setShowTooltip(true);
  }, [dragState]);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
    setTooltipPosition(null);
  }, []);

  const displayX = dragState ? dragState.currentX : x;
  const displayY = dragState && dragState.mode === 'move' ? dragState.currentY + BAR_TOP_OFFSET : barY;
  const displayWidth = dragState ? dragState.currentWidth : width;
  const textInsetLeft = isDone || isCancelled ? 18 : 6;
  const textInsetRight = 6;
  const availableTextWidth = Math.max(displayWidth - textInsetLeft - textInsetRight, 0);
  const maxChars = Math.max(4, Math.floor(availableTextWidth / 6));
  const displayTitle = truncateWithEllipsis(task.title, maxChars);

  // Format dates for tooltip
  const startDateStr = task.start_date ? format(new Date(task.start_date), 'MMM d, yyyy') : 'No start';
  const dueDateStr = task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : 'No due date';
  const statusLabel = task.status.charAt(0).toUpperCase() + task.status.slice(1).replace('_', ' ');

  return (
    <g
      className="gantt-task-bar cursor-pointer group"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Clip path for text inside bar */}
      <defs>
        <clipPath id={clipId}>
          <rect x={displayX} y={displayY} width={displayWidth} height={BAR_HEIGHT} rx={4} ry={4} />
        </clipPath>
        {/* Gradient for active status (todo/in_progress) - left to right */}
        {isActiveStatus && (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={barColor} stopOpacity={1} />
            <stop offset="50%" stopColor={barColor} stopOpacity={0.9} />
            <stop offset="100%" stopColor={barColor} stopOpacity={0.75} />
          </linearGradient>
        )}
      </defs>

      {/* Ghost bar during drag */}
      {dragState && (
        <rect
          x={x}
          y={barY}
          width={width}
          height={BAR_HEIGHT}
          rx={4}
          ry={4}
          fill={barColor}
          opacity={0.2}
        />
      )}

      {/* Drop target row highlight during vertical drag */}
      {dragState && dragState.mode === 'move' && Math.round(dragState.currentY / ROW_HEIGHT) !== Math.round(dragState.originalY / ROW_HEIGHT) && (
        <rect
          x={0}
          y={Math.round(dragState.currentY / ROW_HEIGHT) * ROW_HEIGHT}
          width="100%"
          height={ROW_HEIGHT}
          fill="#3b82f6"
          opacity={0.08}
        />
      )}

      {/* Background bar (full) */}
      <rect
        ref={barRef}
        x={displayX}
        y={displayY}
        width={displayWidth}
        height={BAR_HEIGHT}
        rx={4}
        ry={4}
        fill={dragState?.overUnscheduled ? '#ef4444' : isActiveStatus ? `url(#${gradientId})` : barColor}
        opacity={dragState?.overUnscheduled ? 0.3 : 1}
        className="hover:brightness-105 transition-all"
      />

      {/* Selection border */}
      {selected && (
        <rect
          x={displayX - 1}
          y={displayY - 1}
          width={displayWidth + 2}
          height={BAR_HEIGHT + 2}
          rx={5}
          ry={5}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
        />
      )}

      {/* Unschedule indicator when dragging below timeline */}
      {dragState?.overUnscheduled && (
        <rect
          x={displayX - 1}
          y={displayY - 1}
          width={displayWidth + 2}
          height={BAR_HEIGHT + 2}
          rx={5}
          ry={5}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2}
          strokeDasharray="4,2"
        />
      )}

      {/* Task name inside bar (clipped) */}
      {showNameInBar && (
        <>
          {/* Status icon for done/cancelled tasks */}
          {(isDone || isCancelled) && (
            <foreignObject
              x={displayX + 4}
              y={displayY + BAR_HEIGHT / 2 - 5}
              width={10}
              height={10}
              className="pointer-events-none"
            >
              <div className="h-2.5 w-2.5 text-white">
                {isDone ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
              </div>
            </foreignObject>
          )}
          <text
            x={displayX + textInsetLeft}
            y={displayY + BAR_HEIGHT / 2 + 4}
            fontSize={11}
            fill="#ffffff"
            className="pointer-events-none select-none"
            clipPath={`url(#${clipId})`}
            textDecoration={isDone || isCancelled ? 'line-through' : undefined}
          >
            {displayTitle}
          </text>
        </>
      )}

      {/* Task name on right side for narrow bars */}
      {showNameOnRight && (
        <text
          x={displayX + displayWidth + 6}
          y={displayY + BAR_HEIGHT / 2 + 4}
          fontSize={11}
          fill="currentColor"
          className="pointer-events-none select-none opacity-70"
        >
          {task.title}
        </text>
      )}

      {/* Left resize handle */}
      <g
        className="cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onPointerDown={(e) => handlePointerDown(e, 'resize-left')}
      >
        <rect
          x={displayX}
          y={displayY}
          width={6}
          height={BAR_HEIGHT}
          fill="transparent"
        />
        <line
          x1={displayX + 2}
          y1={displayY + BAR_HEIGHT * 0.3}
          x2={displayX + 2}
          y2={displayY + BAR_HEIGHT * 0.7}
          stroke="white"
          strokeOpacity={0.6}
          strokeWidth={1}
        />
        <line
          x1={displayX + 4}
          y1={displayY + BAR_HEIGHT * 0.3}
          x2={displayX + 4}
          y2={displayY + BAR_HEIGHT * 0.7}
          stroke="white"
          strokeOpacity={0.6}
          strokeWidth={1}
        />
      </g>

      {/* Right resize handle */}
      <g
        className="cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onPointerDown={(e) => handlePointerDown(e, 'resize-right')}
      >
        <rect
          x={displayX + displayWidth - 6}
          y={displayY}
          width={6}
          height={BAR_HEIGHT}
          fill="transparent"
        />
        <line
          x1={displayX + displayWidth - 4}
          y1={displayY + BAR_HEIGHT * 0.3}
          x2={displayX + displayWidth - 4}
          y2={displayY + BAR_HEIGHT * 0.7}
          stroke="white"
          strokeOpacity={0.6}
          strokeWidth={1}
        />
        <line
          x1={displayX + displayWidth - 2}
          y1={displayY + BAR_HEIGHT * 0.3}
          x2={displayX + displayWidth - 2}
          y2={displayY + BAR_HEIGHT * 0.7}
          stroke="white"
          strokeOpacity={0.6}
          strokeWidth={1}
        />
      </g>

      {/* Move handle (center) */}
      <rect
        x={displayX + 6}
        y={displayY}
        width={Math.max(displayWidth - 12, 0)}
        height={BAR_HEIGHT}
        fill="transparent"
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => handlePointerDown(e, 'move')}
      />

      {/* Tooltip rendered via Portal to avoid SVG clipping */}
      {showTooltip && !dragState && tooltipPosition && createPortal(
        <div
          className="fixed z-50 bg-popover border rounded-md shadow-lg px-3 py-2 text-xs pointer-events-none"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y - 84,
            minWidth: 200,
            maxWidth: 280,
          }}
        >
          <div className="font-medium text-foreground truncate mb-1">{task.title}</div>
          {projectName && (
            <div className="text-muted-foreground mb-1">
              Project: {projectName}
            </div>
          )}
          <div className="text-muted-foreground">
            {startDateStr} - {dueDateStr}
          </div>
          <div className="text-muted-foreground">
            Status: {statusLabel}
          </div>
        </div>,
        document.body
      )}

      {/* Unschedule hint when dragging below timeline */}
      {dragState?.overUnscheduled && barRef.current && createPortal(
        <div
          className="fixed z-50 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-md shadow-lg px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 pointer-events-none whitespace-nowrap"
          style={{
            left: barRef.current.getBoundingClientRect().left,
            top: barRef.current.getBoundingClientRect().bottom + 4,
          }}
        >
          Drop to unschedule
        </div>,
        document.body,
      )}
    </g>
  );
}
