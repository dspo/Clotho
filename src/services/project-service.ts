import { invoke } from '@tauri-apps/api/core';
import type { Project, ProjectWithStats, CreateProjectInput, UpdateProjectInput } from '@/types/project';

export const projectService = {
  list: (statusFilter?: string) =>
    invoke<ProjectWithStats[]>('list_projects', { statusFilter }),

  get: (id: string) =>
    invoke<Project>('get_project', { id }),

  create: (input: CreateProjectInput) =>
    invoke<Project>('create_project', { ...input }),

  update: (id: string, input: UpdateProjectInput) =>
    invoke<Project>('update_project', { id, ...input } as Record<string, unknown>),

  delete: (id: string) =>
    invoke('delete_project', { id }),

  reorder: (projectIds: string[]) =>
    invoke('reorder_projects', { projectIds }),
};
