import { invoke } from '@tauri-apps/api/core';
import type { TaskWithTags, TaskDetail, CreateTaskInput, UpdateTaskInput } from '@/types/task';

export const taskService = {
  listByProject: (projectId?: string) =>
    invoke<TaskWithTags[]>('list_tasks', { projectId: projectId ?? null }),

  get: (id: string) =>
    invoke<TaskDetail>('get_task', { id }),

  create: async (input: CreateTaskInput): Promise<TaskWithTags> => {
    const task = await invoke<TaskWithTags>('create_task', {
      projectId: input.project_id,
      title: input.title,
      description: input.description,
      descriptionFormat: input.description_format,
      status: input.status,
      priority: input.priority,
      startDate: input.start_date,
      dueDate: input.due_date,
      parentTaskId: input.parent_task_id,
    });
    if (input.tag_ids && input.tag_ids.length > 0) {
      await Promise.all(
        input.tag_ids.map((tagId) => invoke('add_task_tag', { taskId: task.id, tagId })),
      );
    }
    return task;
  },

  update: async (id: string, input: UpdateTaskInput): Promise<TaskWithTags> => {
    const task = await invoke<TaskWithTags>('update_task', {
      id,
      title: input.title,
      description: input.description,
      descriptionFormat: input.description_format,
      status: input.status,
      priority: input.priority,
      startDate: input.start_date,
      dueDate: input.due_date,
      sortOrder: input.sort_order,
      kanbanOrder: input.kanban_order,
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
