import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { ROW_HEIGHT, HEADER_HEIGHT } from './gantt-utils';
import { useUIStore } from '@/stores/ui-store';
import type { Project } from '@/types/project';
import type { TaskWithTags, TaskStatus } from '@/types/task';

interface ProjectStats {
  unscheduled: number;
  todo: number;
  in_progress: number;
  done: number;
  cancelled: number;
  total: number;
}

interface ProjectRow {
  project: Project;
  stats: ProjectStats;
}

interface GanttProjectListProps {
  projects: Project[];
  tasks: TaskWithTags[];
  hoveredProjectId: string | null;
  onProjectHover: (projectId: string | null) => void;
  projectRowCounts?: Map<string, number>;
  onNewTask?: (projectId: string) => void;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  unscheduled: '#6B7280',  // gray
  todo: '#8B5CF6',         // purple
  in_progress: '#F59E0B',  // amber
  done: '#10B981',         // green
  cancelled: '#EF4444',    // red
};

function computeProjectStats(tasks: TaskWithTags[], projectId: string): ProjectStats {
  const projectTasks = tasks.filter((t) => t.project_id === projectId);
  return {
    unscheduled: projectTasks.filter((t) => t.status === 'unscheduled').length,
    todo: projectTasks.filter((t) => t.status === 'todo').length,
    in_progress: projectTasks.filter((t) => t.status === 'in_progress').length,
    done: projectTasks.filter((t) => t.status === 'done').length,
    cancelled: projectTasks.filter((t) => t.status === 'cancelled').length,
    total: projectTasks.length,
  };
}

function StackedProgressBar({ stats }: { stats: ProjectStats }) {
  if (stats.total === 0) {
    return (
      <div className="h-2.5 w-full rounded-full bg-muted" />
    );
  }

  const allSegments: { status: TaskStatus; count: number; color: string }[] = [
    { status: 'unscheduled', count: stats.unscheduled, color: STATUS_COLORS.unscheduled },
    { status: 'todo', count: stats.todo, color: STATUS_COLORS.todo },
    { status: 'in_progress', count: stats.in_progress, color: STATUS_COLORS.in_progress },
    { status: 'done', count: stats.done, color: STATUS_COLORS.done },
    { status: 'cancelled', count: stats.cancelled, color: STATUS_COLORS.cancelled },
  ];
  const segments = allSegments.filter((s) => s.count > 0);

  // Build a smooth gradient with soft transitions between adjacent status colors
  const stops: string[] = [];
  let offset = 0;
  const transitionWidth = 2; // percentage of smooth blend between segments
  for (let i = 0; i < segments.length; i++) {
    const pct = (segments[i].count / stats.total) * 100;
    if (i === 0) {
      stops.push(`${segments[i].color} ${offset}%`);
      stops.push(`${segments[i].color} ${offset + pct - transitionWidth}%`);
    } else {
      // Smooth transition from previous color
      stops.push(`${segments[i].color} ${offset + transitionWidth}%`);
      stops.push(`${segments[i].color} ${offset + pct - (i < segments.length - 1 ? transitionWidth : 0)}%`);
    }
    offset += pct;
  }

  return (
    <div
      className="h-2.5 w-full rounded-full shadow-inner"
      style={{
        background: segments.length === 1
          ? segments[0].color
          : `linear-gradient(to right, ${stops.join(', ')})`,
      }}
      title={segments.map((s) => `${s.status}: ${s.count}`).join(', ')}
    />
  );
}

export function GanttProjectListHeader() {
  return (
    <div
      className="flex items-center border-b bg-muted/50 text-xs font-medium text-muted-foreground shrink-0 px-2"
      style={{ height: HEADER_HEIGHT }}
    >
      <div className="flex-1">Project</div>
    </div>
  );
}

export function GanttProjectListBody({
  projects,
  tasks,
  hoveredProjectId,
  onProjectHover,
  projectRowCounts,
  onNewTask,
}: GanttProjectListProps) {
  const navigate = useNavigate();
  const setPendingListFilter = useUIStore((s) => s.setPendingListFilter);
  const setSelectedProjectIds = useUIStore((s) => s.setSelectedProjectIds);

  const projectRows: ProjectRow[] = useMemo(() => {
    return projects.map((project) => ({
      project,
      stats: computeProjectStats(tasks, project.id),
    }));
  }, [projects, tasks]);

  const handleUnscheduledClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setSelectedProjectIds([projectId]);
    setPendingListFilter({ projectId, unscheduled: true });
    navigate({ to: '/list' });
  };

  return (
    <div className="flex flex-col">
      {projectRows.map((row) => {
        const rowCountForProject = projectRowCounts?.get(row.project.id) ?? 3;
        const projectHeight = rowCountForProject * ROW_HEIGHT;
        return (
          <div
            key={row.project.id}
            className={cn(
              'flex flex-col gap-1.5 border-b text-sm transition-colors px-2 py-1',
              hoveredProjectId === row.project.id && 'bg-muted/60',
            )}
            style={{ height: projectHeight }}
            onMouseEnter={() => onProjectHover(row.project.id)}
            onMouseLeave={() => onProjectHover(null)}
          >
            {/* ① Project title */}
            <div className="flex items-center gap-2 min-w-0 shrink-0 mt-1 group/project">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: row.project.color }}
              />
              <span className="truncate font-medium">{row.project.name}</span>
              <span className="text-xs text-muted-foreground ml-1 shrink-0">
                ({row.stats.total})
              </span>
              {row.stats.unscheduled > 0 && (
                <button
                  type="button"
                  onClick={(e) => handleUnscheduledClick(e, row.project.id)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] leading-none bg-muted text-muted-foreground hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/40 dark:hover:text-amber-400 transition-colors shrink-0"
                  title={`${row.stats.unscheduled} unscheduled tasks — click to view in List`}
                >
                  ∅ {row.stats.unscheduled}
                </button>
              )}
              {onNewTask && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onNewTask(row.project.id); }}
                  className="ml-auto opacity-0 group-hover/project:opacity-100 p-0.5 rounded hover:bg-muted/60 text-muted-foreground transition-opacity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* ② Stacked progress bar */}
            <div className="w-3/4 shrink-0">
              <StackedProgressBar stats={row.stats} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
