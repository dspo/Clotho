import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CalendarEvent } from './calendar-utils';
import { getPriorityColor } from './calendar-utils';

interface CalendarEventItemProps {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent) => void;
  onDoubleClick?: (event: CalendarEvent) => void;
  onDragStart?: (e: React.DragEvent, event: CalendarEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  compact?: boolean;
}

export const CalendarEventItem = React.memo(function CalendarEventItem({
  event,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  compact = false,
}: CalendarEventItemProps) {
  const priorityColor = getPriorityColor(event.task.priority);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          draggable={!!onDragStart}
          onDragStart={(e) => onDragStart?.(e, event)}
          onDragEnd={onDragEnd}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(event);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick?.(event);
          }}
          className={cn(
            'group w-full truncate rounded px-1.5 text-left text-xs text-white transition-opacity',
            compact ? 'py-0.5' : 'py-0.5',
            event.isCompleted && 'opacity-50',
            onDragStart && 'cursor-grab active:cursor-grabbing',
          )}
          style={{ backgroundColor: event.color }}
        >
          {event.projectName && (
            <span className="block truncate text-[10px] leading-tight opacity-70">
              {event.projectName}
            </span>
          )}
          <span className="flex items-center gap-1 truncate">
            {priorityColor && (
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: priorityColor }}
              />
            )}
            <span className={cn('truncate', event.isCompleted && 'line-through')}>
              {event.title}
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px]">
        {event.projectName && (
          <p className="text-xs text-muted-foreground">{event.projectName}</p>
        )}
        <p className="font-medium">{event.title}</p>
        <p className="text-xs text-muted-foreground">
          {event.task.status} / {event.task.priority}
        </p>
      </TooltipContent>
    </Tooltip>
  );
});
