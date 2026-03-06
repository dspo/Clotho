import { invoke } from '@tauri-apps/api/core';
import type { TaskImage } from '@/types/task';

export const imageService = {
  list: (taskId: string) =>
    invoke<TaskImage[]>('list_task_images', { taskId }),

  upload: (taskId: string, filename: string, data: number[], mimeType: string) =>
    invoke<TaskImage>('upload_task_image', { taskId, filename, data, mimeType }),

  get: (id: string) =>
    invoke<string>('get_task_image', { id }),

  getByFilename: (taskId: string, filename: string) =>
    invoke<string>('get_task_image_by_filename', { taskId, filename }),

  delete: (id: string) =>
    invoke('delete_task_image', { id }),
};
