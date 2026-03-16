import { create } from 'zustand';
import type { TaskWithTags, CreateTaskInput, UpdateTaskInput } from '@/types/task';
import { taskService } from '@/services/task-service';

interface TaskState {
  tasks: TaskWithTags[];
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;

  fetchTasks: (projectId?: string) => Promise<void>;
  setSelectedTask: (id: string | null) => void;
  createTask: (input: CreateTaskInput) => Promise<TaskWithTags>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  reorderTasks: (taskIds: string[], orderField: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  getTasksByProject: (projectId: string) => TaskWithTags[];
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  loading: false,
  error: null,

  fetchTasks: async (projectId?: string) => {
    set({ loading: true, error: null });
    try {
      const tasks = await taskService.listByProject(projectId);
      set({ tasks, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  setSelectedTask: (id) => {
    set({ selectedTaskId: id });
  },

  createTask: async (input) => {
    const task = await taskService.create(input);
    // Re-fetch all tasks to stay in sync
    await get().fetchTasks();
    return task;
  },

  updateTask: async (id, input) => {
    try {
      await taskService.update(id, input);
      await get().fetchTasks();
    } catch (err) {
      throw err;
    }
  },

  reorderTasks: async (taskIds, orderField) => {
    try {
      await taskService.reorder(taskIds, orderField);
      await get().fetchTasks();
    } catch (err) {
      throw err;
    }
  },

  deleteTask: async (id) => {
    const prev = get().tasks;
    set({ tasks: prev.filter((t) => t.id !== id) });
    try {
      await taskService.delete(id);
    } catch (err) {
      set({ tasks: prev });
      throw err;
    }
  },

  getTasksByProject: (projectId) => {
    return get().tasks.filter((t) => t.project_id === projectId);
  },
}));
