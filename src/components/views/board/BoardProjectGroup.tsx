import { Plus } from 'lucide-react';
import { BoardCard } from './BoardCard';
import type { TaskWithTags } from '@/types/task';

interface BoardProjectGroupProps {
  projectName: string;
  projectColor: string;
  tasks: TaskWithTags[];
  allTasks: TaskWithTags[];
  filteredIds: Set<string> | null;
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  onTaskDoubleClick: (taskId: string) => void;
  onNewTask?: () => void;
}

export function BoardProjectGroup({
  projectName,
  projectColor,
  tasks,
  allTasks,
  filteredIds,
  selectedTaskId,
  onTaskClick,
  onTaskDoubleClick,
  onNewTask,
}: BoardProjectGroupProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-1 pt-1 group/project">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: projectColor }}
        />
        <span className="text-sm font-medium text-foreground truncate">
          {projectName}
        </span>
        <span className="text-[10px] text-muted-foreground">
          ({tasks.length})
        </span>
        {onNewTask && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNewTask(); }}
            className="ml-auto opacity-0 group-hover/project:opacity-100 p-0.5 rounded hover:bg-muted/60 text-muted-foreground transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-1.5 pl-1">
        {tasks.map((task) => {
          const subtasks = allTasks.filter(
            (t) => t.parent_task_id === task.id,
          );
          const isDimmed = filteredIds !== null && !filteredIds.has(task.id);
          return (
            <BoardCard
              key={task.id}
              task={task}
              subtasks={subtasks}
              dimmed={isDimmed}
              isSelected={selectedTaskId === task.id}
              onClick={() => onTaskClick(task.id)}
              onDoubleClick={() => onTaskDoubleClick(task.id)}
              projectColor={projectColor}
            />
          );
        })}
      </div>
    </div>
  );
}
