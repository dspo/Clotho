export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  status: 'active' | 'archived';
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectWithStats extends Project {
  total_tasks: number;
  completed_tasks: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  color?: string;
  status?: 'active' | 'archived';
}
