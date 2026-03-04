import { create } from 'zustand';
import type { Project, ProjectWithStats, CreateProjectInput, UpdateProjectInput } from '@/types/project';
import { projectService } from '@/services/project-service';

interface ProjectState {
  projects: ProjectWithStats[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;

  fetchProjects: (statusFilter?: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  updateProject: (id: string, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  reorderProjects: (ids: string[]) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,
  error: null,

  fetchProjects: async (statusFilter?: string) => {
    set({ loading: true, error: null });
    try {
      const projects = await projectService.list(statusFilter);
      set({ projects, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
  },

  createProject: async (input) => {
    const project = await projectService.create(input);
    await get().fetchProjects();
    return project;
  },

  updateProject: async (id, input) => {
    const prev = get().projects;
    set({
      projects: prev.map((p) =>
        p.id === id ? { ...p, ...input } : p
      ),
    });
    try {
      await projectService.update(id, input);
    } catch (err) {
      set({ projects: prev });
      throw err;
    }
  },

  deleteProject: async (id) => {
    const prev = get().projects;
    set({ projects: prev.filter((p) => p.id !== id) });
    try {
      await projectService.delete(id);
    } catch (err) {
      set({ projects: prev });
      throw err;
    }
  },

  reorderProjects: async (ids) => {
    await projectService.reorder(ids);
    await get().fetchProjects();
  },
}));
