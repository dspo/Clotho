import { invoke } from '@tauri-apps/api/core';
import type { TaskDependency, CreateDependencyInput } from '@/types/dependency';

export const dependencyService = {
  listByTask: (taskId: string) =>
    invoke<TaskDependency[]>('list_dependencies', { taskId }),

  create: (input: CreateDependencyInput) =>
    invoke<TaskDependency>('create_dependency', { ...input }),

  delete: (id: string) =>
    invoke('delete_dependency', { id }),
};
