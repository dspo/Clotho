import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ROW_HEIGHT, HEADER_HEIGHT } from './gantt-utils';
import type { TaskWithTags } from '@/types/task';

export type GanttRow =
  | {
      type: 'project';
      projectId: string;
      projectName: string;
      projectColor: string;
      expanded: boolean;
      taskCount: number;
    }
  | {
      type: 'task';
      task: TaskWithTags;
      depth: number;
      hasChildren: boolean;
      expanded: boolean;
      taskColor: string;
      /** Index of this task within its project group (for color variation) */
      indexInProject: number;
    }
  | {
      type: 'spacer';
      projectId: string;
      projectColor: string;
    };

interface GanttTaskListProps {
  rows: GanttRow[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onTaskDoubleClick?: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRowHover: (index: number | null) => void;
  hoveredRow: number | null;
}

export function GanttTaskListHeader() {
  return (
    <div
      className="flex items-center border-b bg-muted/50 text-xs font-medium text-muted-foreground shrink-0"
      style={{ height: HEADER_HEIGHT }}
    >
      <div className="w-6 shrink-0" />
      <div className="flex-1 px-2">Task</div>
    </div>
  );
}

export function GanttTaskListBody({
  rows,
  selectedTaskId,
  onSelectTask,
  onTaskDoubleClick,
  onToggleExpand,
  onRowHover,
  hoveredRow,
}: GanttTaskListProps) {
  return (
    <div className="flex flex-col">
      {rows.map((row, index) => {
        if (row.type === 'project') {
          return (
            <div
              key={`project-${row.projectId}`}
              className={cn(
                'flex items-center border-b text-sm font-medium bg-muted/40 transition-colors cursor-pointer',
                hoveredRow === index && 'bg-muted/60',
              )}
              style={{ height: ROW_HEIGHT }}
              onClick={() => onToggleExpand(row.projectId)}
              onMouseEnter={() => onRowHover(index)}
              onMouseLeave={() => onRowHover(null)}
            >
              {/* Expand toggle */}
              <div className="w-6 shrink-0 flex items-center justify-center">
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-muted"
                >
                  {row.expanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>

              {/* Project color dot + name */}
              <div className="flex items-center gap-2 flex-1 truncate px-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: row.projectColor }}
                />
                <span className="truncate">{row.projectName}</span>
                <span className="text-xs text-muted-foreground ml-1">
                  ({row.taskCount})
                </span>
              </div>
            </div>
          );
        }

        if (row.type === 'spacer') {
          return (
            <div
              key={`spacer-${row.projectId}-${index}`}
              className="border-b"
              style={{ height: ROW_HEIGHT }}
            />
          );
        }

        const { task, depth, hasChildren, expanded } = row;

        return (
          <div
            key={task.id}
            className={cn(
              'flex items-center border-b text-sm transition-colors cursor-pointer',
              selectedTaskId === task.id && 'bg-accent',
              hoveredRow === index && selectedTaskId !== task.id && 'bg-muted/30',
            )}
            style={{ height: ROW_HEIGHT }}
            onClick={() => onSelectTask(task.id)}
            onDoubleClick={() => onTaskDoubleClick?.(task.id)}
            onMouseEnter={() => onRowHover(index)}
            onMouseLeave={() => onRowHover(null)}
          >
            {/* Expand toggle */}
            <div className="w-6 shrink-0 flex items-center justify-center">
              {hasChildren && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(task.id);
                  }}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>

            {/* Task name with indent (depth+1 because depth 0 tasks are under a project) */}
            <div
              className="flex items-center gap-1.5 flex-1 truncate px-1"
              style={{ paddingLeft: (depth + 1) * 24 }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: row.taskColor }}
              />
              <span className="truncate">{task.title}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
