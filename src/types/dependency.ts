export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';

export interface TaskDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: DependencyType;
  created_at: string;
}

export interface CreateDependencyInput {
  predecessor_id: string;
  successor_id: string;
  dependency_type?: DependencyType;
}
