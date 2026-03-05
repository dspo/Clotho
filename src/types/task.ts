import type { Tag } from './tag';

export type TaskStatus = 'unscheduled' | 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskDifficulty = 'simple' | 'medium' | 'complex';
export type DescriptionFormat = 'richtext' | 'markdown';

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  description_format: DescriptionFormat | null;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  kanban_order: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaskWithTags extends Task {
  tags: Tag[];
}

export interface TaskDetail extends TaskWithTags {
  subtasks: TaskWithTags[];
}

export interface CreateTaskInput {
  project_id: string;
  parent_task_id?: string;
  title: string;
  description?: string;
  description_format?: DescriptionFormat;
  status?: TaskStatus;
  priority?: TaskPriority;
  difficulty?: TaskDifficulty;
  start_date?: string;
  due_date?: string;
  estimated_hours?: number;
  tag_ids?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  description_format?: DescriptionFormat;
  status?: TaskStatus;
  priority?: TaskPriority;
  difficulty?: TaskDifficulty | null;
  start_date?: string | null;
  due_date?: string | null;
  sort_order?: number;
  kanban_order?: number | string;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  /** When provided, replaces the full set of tags for this task */
  tag_ids?: string[];
  /** Move task to a different project */
  project_id?: string;
}

export interface TaskImage {
  id: string;
  task_id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
}
