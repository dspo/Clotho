import { useState } from 'react';
import { ChevronRight, Pencil, Archive, Trash2, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProgressBar } from '@/components/common/ProgressBar';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectTaskList } from './ProjectTaskList';
import type { ProjectWithStats } from '@/types/project';

interface ProjectRowProps {
  project: ProjectWithStats;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onTaskClick: (taskId: string) => void;
  isDraggable?: boolean;
}

export function ProjectRow({
  project,
  expanded,
  onToggleExpand,
  onEdit,
  onArchive,
  onDelete,
  onTaskClick,
  isDraggable = false,
}: ProjectRowProps) {
  const [hovering, setHovering] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: !isDraggable });

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleRowClick = () => {
    onToggleExpand();
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand();
  };

  const statusLabel =
    project.status === 'archived'
      ? 'Archived'
      : project.total_tasks > 0 && project.completed_tasks === project.total_tasks
        ? 'Completed'
        : 'Active';

  const statusColorClass =
    statusLabel === 'Archived'
      ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      : statusLabel === 'Completed'
        ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
        : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';

  return (
    <ProjectContextMenu
      isArchived={project.status === 'archived'}
      onOpen={handleRowClick}
      onRename={onEdit}
      onArchive={project.status !== 'archived' ? onArchive : undefined}
      onUnarchive={project.status === 'archived' ? onArchive : undefined}
      onDelete={onDelete}
    >
      <div
        ref={setNodeRef}
        style={dndStyle}
        className={cn(
          'border-b last:border-b-0',
          isDragging && 'opacity-50 bg-muted',
        )}
      >
        <div
          className="flex items-center gap-3 px-4 h-[72px] cursor-pointer transition-colors hover:bg-muted/50"
          onClick={handleRowClick}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {/* Drag handle */}
          {isDraggable && (
            <button
              type="button"
              className="shrink-0 cursor-grab rounded p-0.5 hover:bg-muted text-muted-foreground"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}

          {/* Expand arrow */}
          <button
            type="button"
            onClick={handleExpandClick}
            className="shrink-0 rounded p-0.5 hover:bg-muted"
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-150',
                expanded && 'rotate-90',
              )}
            />
          </button>

          {/* Color dot */}
          <span
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: project.color }}
          />

          {/* Name + description */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-muted-foreground truncate">{project.description}</p>
            )}
          </div>

          {/* Task stats */}
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {project.completed_tasks}/{project.total_tasks} done
          </span>

          {/* Progress bar */}
          <ProgressBar
            completed={project.completed_tasks}
            total={project.total_tasks}
            className="w-[120px] shrink-0"
          />

          {/* Hover actions or status badge */}
          <div className="w-[120px] flex items-center justify-end shrink-0">
            {hovering ? (
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit project</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive();
                      }}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Archive project</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete project</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  statusColorClass,
                )}
              >
                {statusLabel}
              </span>
            )}
          </div>
        </div>

        {/* Expanded task list */}
        {expanded && (
          <ProjectTaskList projectId={project.id} onTaskDoubleClick={onTaskClick} />
        )}
      </div>
    </ProjectContextMenu>
  );
}
