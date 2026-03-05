import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { BoardColumnHeader } from './BoardColumnHeader';
import { BoardCard } from './BoardCard';
import { BoardProjectGroup } from './BoardProjectGroup';
import { TaskContextMenu } from '@/components/task/TaskContextMenu';
import type { TaskWithTags } from '@/types/task';

interface ProjectGroup {
  projectId: string;
  projectName: string;
  projectColor: string;
  tasks: TaskWithTags[];
}

interface BoardColumnProps {
  id: string;
  name: string;
  color: string;
  tasks: TaskWithTags[];
  allTasks: TaskWithTags[];
  filteredIds: Set<string> | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onTaskClick: (taskId: string) => void;
  onTaskDoubleClick: (taskId: string) => void;
  selectedTaskId: string | null;
  isDragOver?: boolean;
  projectColorMap?: Map<string, string>;
  projectGroups?: ProjectGroup[];
}

export function BoardColumn({
  id,
  name,
  color,
  tasks,
  allTasks,
  filteredIds,
  collapsed,
  onToggleCollapse,
  onTaskClick,
  onTaskDoubleClick,
  selectedTaskId,
  isDragOver,
  projectColorMap,
  projectGroups,
}: BoardColumnProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: 'Column',
      column: { id, name },
    },
  });
  const taskIds = tasks.map((t) => t.id);

  const matchingCount = filteredIds
    ? tasks.filter((t) => filteredIds.has(t.id)).length
    : tasks.length;

  if (collapsed) {
    return (
      <div
        className={cn(
          'w-10 shrink-0 rounded-lg bg-muted/50 transition-all duration-200',
        )}
      >
        <BoardColumnHeader
          name={name}
          color={color}
          count={matchingCount}
          totalCount={filteredIds ? tasks.length : undefined}
          collapsed
          onToggleCollapse={onToggleCollapse}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group/col flex w-[280px] shrink-0 flex-col rounded-lg bg-muted/50 transition-colors duration-150',
        isDragOver && 'bg-muted ring-2 ring-primary/30 ring-inset',
      )}
    >
      <BoardColumnHeader
        name={name}
        color={color}
        count={matchingCount}
        totalCount={filteredIds ? tasks.length : undefined}
        collapsed={false}
        onToggleCollapse={onToggleCollapse}
      />

      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 pb-2"
        style={{ minHeight: 120 }}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tasks
            </p>
          )}
          {projectGroups && projectGroups.length > 0 ? (
            projectGroups.map((pg) => (
              <BoardProjectGroup
                key={pg.projectId}
                projectName={pg.projectName}
                projectColor={pg.projectColor}
                tasks={pg.tasks}
                allTasks={allTasks}
                filteredIds={filteredIds}
                selectedTaskId={selectedTaskId}
                onTaskClick={onTaskClick}
                onTaskDoubleClick={onTaskDoubleClick}
              />
            ))
          ) : (
            tasks.map((task) => {
              const subtasks = allTasks.filter(
                (t) => t.parent_task_id === task.id,
              );
              const isDimmed = filteredIds !== null && !filteredIds.has(task.id);
              return (
                <TaskContextMenu key={task.id} taskIdForCopy={task.id}>
                  <BoardCard
                    task={task}
                    subtasks={subtasks}
                    dimmed={isDimmed}
                    isSelected={selectedTaskId === task.id}
                    onClick={() => onTaskClick(task.id)}
                    onDoubleClick={() => onTaskDoubleClick(task.id)}
                    projectColor={projectColorMap?.get(task.project_id)}
                  />
                </TaskContextMenu>
              );
            })
          )}
        </SortableContext>
      </div>
    </div>
  );
}
