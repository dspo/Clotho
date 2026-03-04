import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTaskStore } from '@/stores/task-store';
import { useTagStore } from '@/stores/tag-store';
import { ProjectTaskRow } from './ProjectTaskRow';
import { TaskCreateDialog } from '@/components/task/TaskCreateDialog';
import type { CreateTaskInput } from '@/types/task';

interface ProjectTaskListProps {
  projectId: string;
  onTaskDoubleClick: (taskId: string) => void;
}

export function ProjectTaskList({ projectId, onTaskDoubleClick }: ProjectTaskListProps) {
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const getTasksByProject = useTaskStore((s) => s.getTasksByProject);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const tasks = getTasksByProject(projectId);
  const tags = useTagStore((s) => s.tags);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleToggleStatus = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    updateTask(taskId, { status: newStatus });
  };

  const handleCreateTaskFromDialog = (input: CreateTaskInput) => {
    createTask(input);
  };

  // Only show top-level tasks (no parent)
  const topLevelTasks = tasks.filter((t) => !t.parent_task_id);

  return (
    <div className="border-t">
      {topLevelTasks.map((task) => (
        <ProjectTaskRow
          key={task.id}
          task={task}
          onToggleStatus={handleToggleStatus}
          onDoubleClick={onTaskDoubleClick}
        />
      ))}
      <div className="pl-7">
        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New task
        </button>
      </div>
      <TaskCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateTaskFromDialog}
        projectId={projectId}
        allTags={tags}
      />
    </div>
  );
}
