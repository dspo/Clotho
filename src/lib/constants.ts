import type { TaskStatus, TaskPriority, TaskDifficulty } from '@/types/task';

export const TASK_STATUSES = [
  { value: 'unscheduled' as TaskStatus, label: 'Unscheduled', color: '#6B7280', icon: 'CalendarOff' },
  { value: 'todo' as TaskStatus, label: 'Todo', color: '#8B5CF6', icon: 'CircleDot' },
  { value: 'in_progress' as TaskStatus, label: 'In Progress', color: '#F59E0B', icon: 'Timer' },
  { value: 'done' as TaskStatus, label: 'Done', color: '#10B981', icon: 'CheckCircle2' },
  { value: 'cancelled' as TaskStatus, label: 'Cancelled', color: '#EF4444', icon: 'XCircle' },
] as const;

export const TASK_PRIORITIES = [
  { value: 'urgent' as TaskPriority, label: 'Urgent', color: '#EF4444', icon: 'AlertTriangle' },
  { value: 'high' as TaskPriority, label: 'High', color: '#F97316', icon: 'ArrowUp' },
  { value: 'medium' as TaskPriority, label: 'Medium', color: '#EAB308', icon: 'Minus' },
  { value: 'low' as TaskPriority, label: 'Low', color: '#3B82F6', icon: 'ArrowDown' },
] as const;

export const TASK_DIFFICULTIES = [
  { value: 'simple' as TaskDifficulty, label: 'Simple', labelZh: '简单', color: '#22C55E', icon: 'Circle' },
  { value: 'medium' as TaskDifficulty, label: 'Medium', labelZh: '中等', color: '#F59E0B', icon: 'CircleDot' },
  { value: 'complex' as TaskDifficulty, label: 'Complex', labelZh: '复杂', color: '#EF4444', icon: 'CircleDashed' },
] as const;

export const PROJECT_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280',
];

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 48;
export const DETAIL_PANEL_WIDTH = 480;
