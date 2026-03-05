import { invoke } from '@tauri-apps/api/core';
import type { TaskWithTags, TaskDetail, CreateTaskInput, UpdateTaskInput, TaskStatus } from '@/types/task';

/**
 * Normalize status and dates based on unscheduled rules:
 * - If status is 'unscheduled', clear both dates
 * - If setting a date and status is 'unscheduled', switch to 'todo'
 */
function normalizeStatusDates<T extends { status?: TaskStatus; start_date?: string | null; due_date?: string | null }>(input: T): T {
  const result = { ...input };

  // If setting to unscheduled, clear dates
  if (result.status === 'unscheduled') {
    result.start_date = null;
    result.due_date = null;
  }

  return result;
}

export const taskService = {
  listByProject: (projectId?: string) =>
    invoke<TaskWithTags[]>('list_tasks', { projectId: projectId ?? null }),

  get: (id: string) =>
    invoke<TaskDetail>('get_task', { id }),

  create: async (input: CreateTaskInput): Promise<TaskWithTags> => {
    const normalized = normalizeStatusDates(input);
    const task = await invoke<TaskWithTags>('create_task', {
      projectId: normalized.project_id,
      title: normalized.title,
      description: normalized.description,
      descriptionFormat: normalized.description_format,
      status: normalized.status,
      priority: normalized.priority,
      difficulty: normalized.difficulty,
      startDate: normalized.start_date,
      dueDate: normalized.due_date,
      parentTaskId: normalized.parent_task_id,
    });
    if (input.tag_ids && input.tag_ids.length > 0) {
      await Promise.all(
        input.tag_ids.map((tagId) => invoke('add_task_tag', { taskId: task.id, tagId })),
      );
    }
    return task;
  },

  update: async (id: string, input: UpdateTaskInput): Promise<TaskWithTags> => {
    const normalized = normalizeStatusDates(input);
    const task = await invoke<TaskWithTags>('update_task', {
      id,
      title: normalized.title,
      description: normalized.description,
      descriptionFormat: normalized.description_format,
      status: normalized.status,
      priority: normalized.priority,
      difficulty: normalized.difficulty,
      startDate: normalized.start_date,
      dueDate: normalized.due_date,
      sortOrder: normalized.sort_order,
      kanbanOrder: normalized.kanban_order,
      projectId: normalized.project_id,
    });

    if (input.tag_ids !== undefined) {
      const currentIds = task.tags.map((t) => t.id);
      const nextIds = input.tag_ids;
      const toAdd = nextIds.filter((tid) => !currentIds.includes(tid));
      const toRemove = currentIds.filter((tid) => !nextIds.includes(tid));
      await Promise.all([
        ...toAdd.map((tagId) => invoke('add_task_tag', { taskId: id, tagId })),
        ...toRemove.map((tagId) => invoke('remove_task_tag', { taskId: id, tagId })),
      ]);
    }

    return task;
  },

  delete: (id: string) =>
    invoke('delete_task', { id }),

  reorder: (taskIds: string[], orderField: string) =>
    invoke('reorder_tasks', { taskIds, orderField }),
};
