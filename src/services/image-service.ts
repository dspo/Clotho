import { invoke } from '@tauri-apps/api/core';
import type { TaskImage } from '@/types/task';

export const imageService = {
  list: (taskId: string) =>
    invoke<TaskImage[]>('list_task_images', { taskId }),

  upload: (taskId: string, filename: string, data: number[], mimeType: string) =>
    invoke<TaskImage>('upload_task_image', { taskId, filename, data, mimeType }),

  delete: (id: string) =>
    invoke('delete_task_image', { id }),
};
