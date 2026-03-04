import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCorners,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';import { useTaskStore } from '@/stores/task-store';
import { useTagStore } from '@/stores/tag-store';
import { useUIStore } from '@/stores/ui-store';
import { useProjectStore } from '@/stores/project-store';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/constants';
import { BoardColumn } from './BoardColumn';
import { BoardCardOverlay } from './BoardCardOverlay';
import { BoardToolbar, type BoardGroupBy } from './BoardToolbar';
import { EmptyState } from '@/components/common/EmptyState';
import { TaskCreateDialog } from '@/components/task/TaskCreateDialog';
import { EMPTY_FILTER, type FilterState } from '@/components/filter/FilterToolbar';
import { ClipboardList } from 'lucide-react';
import type { TaskWithTags, TaskStatus, TaskPriority, CreateTaskInput } from '@/types/task';
import type { ProjectWithStats } from '@/types/project';

interface ColumnDef {
  id: string;
  name: string;
  color: string;
  status?: TaskStatus;
  isProject?: boolean;
}

interface SubGroup {
  key: string;
  label: string;
  color: string;
  tasks: TaskWithTags[];
}

function getColumnsForGroup(groupBy: BoardGroupBy, projects: ProjectWithStats[], tasks: TaskWithTags[]): ColumnDef[] {
  if (groupBy === 'priority') {
    return TASK_PRIORITIES.map((p) => ({
      id: p.value,
      name: p.label,
      color: p.color,
    }));
  }
  if (groupBy === 'project' || groupBy === 'project-status') {
    const projectIdsInUse = new Set(tasks.map((t) => t.project_id));
    return projects
      .filter((p) => projectIdsInUse.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isProject: true,
      }));
  }
  return TASK_STATUSES.map((s) => ({
    id: s.value,
    name: s.label,
    color: s.color,
    status: s.value,
  }));
}

function groupTasks(
  tasks: TaskWithTags[],
  groupBy: BoardGroupBy,
  columns: ColumnDef[],
): Map<string, TaskWithTags[]> {
  const groups = new Map<string, TaskWithTags[]>();

  for (const col of columns) {
    groups.set(col.id, []);
  }

  if (groupBy === 'priority') {
    for (const task of tasks) {
      const list = groups.get(task.priority);
      if (list) list.push(task);
    }
  } else if (groupBy === 'project' || groupBy === 'project-status') {
    for (const task of tasks) {
      const list = groups.get(task.project_id);
      if (list) list.push(task);
    }
  } else {
    for (const task of tasks) {
      const list = groups.get(task.status);
      if (list) list.push(task);
    }
  }

  for (const [, list] of groups) {
    list.sort((a, b) => String(a.kanban_order).localeCompare(String(b.kanban_order)));
  }

  return groups;
}

function buildSubGroups(tasks: TaskWithTags[]): SubGroup[] {
  return TASK_STATUSES.map((s) => ({
    key: s.value,
    label: s.label,
    color: s.color,
    tasks: tasks.filter((t) => t.status === s.value),
  })).filter((g) => g.tasks.length > 0);
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  projectColor: string;
  tasks: TaskWithTags[];
}

function buildProjectGroups(
  tasks: TaskWithTags[],
  projects: ProjectWithStats[],
): ProjectGroup[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const groups = new Map<string, TaskWithTags[]>();

  for (const task of tasks) {
    const list = groups.get(task.project_id);
    if (list) {
      list.push(task);
    } else {
      groups.set(task.project_id, [task]);
    }
  }

  return Array.from(groups.entries())
    .map(([projectId, projectTasks]) => {
      const project = projectMap.get(projectId);
      return {
        projectId,
        projectName: project?.name ?? 'Unknown',
        projectColor: project?.color ?? '#6B7280',
        tasks: projectTasks,
      };
    })
    .filter((g) => g.tasks.length > 0);
}

function matchesFilter(task: TaskWithTags, filter: FilterState): boolean {
  if (filter.search) {
    const q = filter.search.toLowerCase();
    if (!task.title.toLowerCase().includes(q)) return false;
  }
  if (filter.statuses.length > 0 && !filter.statuses.includes(task.status)) {
    return false;
  }
  if (filter.priorities.length > 0 && !filter.priorities.includes(task.priority)) {
    return false;
  }
  if (filter.tagIds.length > 0) {
    const taskTagIds = new Set(task.tags.map((t) => t.id));
    if (!filter.tagIds.some((id) => taskTagIds.has(id))) return false;
  }
  return true;
}

function hasActiveFilter(filter: FilterState): boolean {
  return (
    filter.search.length > 0 ||
    filter.statuses.length > 0 ||
    filter.priorities.length > 0 ||
    filter.tagIds.length > 0 ||
    filter.datePreset !== null
  );
}

export function BoardView() {
  const allTasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const createTask = useTaskStore((s) => s.createTask);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const selectedProjectIds = useUIStore((s) => s.selectedProjectIds);
  const tagsList = useTagStore((s) => s.tags);
  const fetchTags = useTagStore((s) => s.fetchTags);
  const projects = useProjectStore((s) => s.projects);

  const [groupBy, setGroupBy] = useState<BoardGroupBy>('status');
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForProjectId, setCreateForProjectId] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchTasks();
    fetchTags();
  }, [fetchTasks, fetchTags]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Custom collision detection: prefer pointerWithin, fallback to closestCorners
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerResult = pointerWithin(args);
    if (pointerResult.length > 0) return pointerResult;
    return closestCorners(args);
  }, []);

  // Filter tasks by selected projects, then only root-level
  const tasks = useMemo(
    () => allTasks.filter(
      (t) => !t.parent_task_id && !t.deleted_at && selectedProjectIds.includes(t.project_id),
    ),
    [allTasks, selectedProjectIds],
  );

  // Build project color map
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.color);
    }
    return map;
  }, [projects]);

  const columns = useMemo(() => getColumnsForGroup(groupBy, projects, tasks), [groupBy, projects, tasks]);
  const grouped = useMemo(() => groupTasks(tasks, groupBy, columns), [tasks, groupBy, columns]);

  const filteredIds = useMemo(() => {
    if (!hasActiveFilter(filter)) return null;
    const ids = new Set<string>();
    for (const task of tasks) {
      if (matchesFilter(task, filter)) {
        ids.add(task.id);
      }
    }
    return ids;
  }, [tasks, filter]);

  const activeTask = useMemo(
    () => (activeId ? tasks.find((t) => t.id === activeId) ?? null : null),
    [activeId, tasks],
  );

  // --- Drag handlers ---

  const findColumnForTask = useCallback(
    (taskId: string): string | null => {
      for (const [colId, colTasks] of grouped) {
        if (colTasks.some((t) => t.id === taskId)) return colId;
      }
      return null;
    },
    [grouped],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over } = event;
      if (!over) {
        setOverColumnId(null);
        return;
      }

      const overId = String(over.id);
      // Handle sub-group droppable IDs (format: "subgroup:{columnId}:{status}")
      if (overId.startsWith('subgroup:')) {
        const columnId = overId.split(':')[1];
        setOverColumnId(columnId);
      } else if (grouped.has(overId)) {
        setOverColumnId(overId);
      } else {
        const col = findColumnForTask(overId);
        setOverColumnId(col);
      }
    },
    [grouped, findColumnForTask],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      setOverColumnId(null);

      const { active, over } = event;
      if (!active || !over) return;

      const activeTaskId = String(active.id);
      const overId = String(over.id);

      const task = tasks.find((t) => t.id === activeTaskId);
      if (!task) return;

      const sourceColumn = findColumnForTask(activeTaskId);
      if (!sourceColumn) return;

      // Resolve target column:
      // Priority: subgroup id > column id > task id (find containing column)
      let targetColumn: string;
      let targetStatus: TaskStatus | null = null;

      if (overId.startsWith('subgroup:')) {
        const parts = overId.split(':');
        targetColumn = parts[1];
        targetStatus = parts[2] as TaskStatus;
      } else if (grouped.has(overId)) {
        // Dropped directly on a column droppable
        targetColumn = overId;
      } else {
        // Dropped on a task card — find its containing column
        const col = findColumnForTask(overId);
        if (!col) return;
        targetColumn = col;
      }

      const targetTasks = [...(grouped.get(targetColumn) ?? [])];

      // Same column, same status — reorder only
      if (sourceColumn === targetColumn && !targetStatus) {
        const sourceTasks = [...(grouped.get(sourceColumn) ?? [])];
        const oldIndex = sourceTasks.findIndex((t) => t.id === activeTaskId);
        const newIndex = sourceTasks.findIndex((t) => t.id === overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        try {
          await useTaskStore.getState().updateTask(activeTaskId, {
            kanban_order: newIndex,
          });
        } catch {
          fetchTasks();
        }
        return;
      }

      // Cross-column drop: update the groupBy field
      const updateInput: Record<string, unknown> = {};

      if (groupBy === 'status') {
        // Only change status — never change project_id
        updateInput.status = targetColumn as TaskStatus;
        if (targetColumn === 'done') {
          updateInput.completed_at = new Date().toISOString();
        } else if (task.status === 'done') {
          updateInput.completed_at = null;
        }
      } else if (groupBy === 'project' || groupBy === 'project-status') {
        // Columns are project ids — don't allow cross-project moves
        if (targetColumn !== task.project_id) return;
        if (groupBy === 'project-status' && targetStatus) {
          updateInput.status = targetStatus;
          if (targetStatus === 'done') {
            updateInput.completed_at = new Date().toISOString();
          } else if (task.status === 'done') {
            updateInput.completed_at = null;
          }
        }
      } else {
        // priority grouping
        updateInput.priority = targetColumn as TaskPriority;
      }

      // Determine kanban_order in target column
      if (grouped.has(overId) || overId.startsWith('subgroup:')) {
        // Dropped on column/subgroup header → append to end
        updateInput.kanban_order = targetTasks.length;
      } else {
        const overIndex = targetTasks.findIndex((t) => t.id === overId);
        updateInput.kanban_order = overIndex !== -1 ? overIndex : targetTasks.length;
      }

      try {
        await useTaskStore.getState().updateTask(activeTaskId, updateInput as any);
      } catch {
        fetchTasks();
      }
    },
    [grouped, tasks, groupBy, findColumnForTask, fetchTasks],
  );

  // --- Task create ---
  const handleCreateTaskFromDialog = useCallback(
    (input: CreateTaskInput) => {
      createTask(input);
    },
    [createTask],
  );

  const handleNewTaskForProject = useCallback((projectId: string) => {
    setCreateForProjectId(projectId);
    setCreateDialogOpen(true);
  }, []);

  const handleTaskClick = useCallback(
    (taskId: string) => {
      setSelectedTask(taskId);
    },
    [setSelectedTask],
  );

  const handleTaskDoubleClick = useCallback(
    (taskId: string) => {
      setSelectedTask(taskId);
      openDetailPanel(taskId);
    },
    [setSelectedTask, openDetailPanel],
  );

  // --- Collapse ---
  const toggleCollapse = useCallback((colId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  }, []);

  // --- Keyboard navigation ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow system shortcuts (Cmd+C, Cmd+V, Cmd+A, etc.)
      if (e.metaKey || e.ctrlKey) {
        return;
      }

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const visibleColumns = columns.filter((c) => !collapsedColumns.has(c.id));

      if (e.key === 'c' || e.key === 'C') {
        return;
      }

      if (!selectedTaskId) {
        if (['j', 'k', 'h', 'l', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          for (const col of visibleColumns) {
            const colTasks = grouped.get(col.id) ?? [];
            if (colTasks.length > 0) {
              setSelectedTask(colTasks[0].id);
              break;
            }
          }
        }
        return;
      }

      let currentColIndex = -1;
      let currentTaskIndex = -1;
      for (let ci = 0; ci < visibleColumns.length; ci++) {
        const colTasks = grouped.get(visibleColumns[ci].id) ?? [];
        const ti = colTasks.findIndex((t) => t.id === selectedTaskId);
        if (ti !== -1) {
          currentColIndex = ci;
          currentTaskIndex = ti;
          break;
        }
      }
      if (currentColIndex === -1) return;

      const currentColTasks = grouped.get(visibleColumns[currentColIndex].id) ?? [];

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentTaskIndex < currentColTasks.length - 1) {
          setSelectedTask(currentColTasks[currentTaskIndex + 1].id);
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentTaskIndex > 0) {
          setSelectedTask(currentColTasks[currentTaskIndex - 1].id);
        }
      } else if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentColIndex > 0) {
          const prevColTasks = grouped.get(visibleColumns[currentColIndex - 1].id) ?? [];
          if (prevColTasks.length > 0) {
            const idx = Math.min(currentTaskIndex, prevColTasks.length - 1);
            setSelectedTask(prevColTasks[idx].id);
          }
        }
      } else if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentColIndex < visibleColumns.length - 1) {
          const nextColTasks = grouped.get(visibleColumns[currentColIndex + 1].id) ?? [];
          if (nextColTasks.length > 0) {
            const idx = Math.min(currentTaskIndex, nextColTasks.length - 1);
            setSelectedTask(nextColTasks[idx].id);
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleTaskDoubleClick(selectedTaskId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskId, columns, collapsedColumns, grouped, setSelectedTask, handleTaskDoubleClick]);

  // Default projectId for task creation dialog
  const defaultProjectId = createForProjectId ?? selectedProjectIds[0] ?? projects.find((p) => p.status === 'active')?.id ?? '';

  const handleCreateDialogOpenChange = useCallback((open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) setCreateForProjectId(undefined);
  }, []);

  // --- Empty state ---
  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <BoardToolbar
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          filter={filter}
          onFilterChange={setFilter}
          tags={tagsList}
          onCreateTask={() => setCreateDialogOpen(true)}
        />
        <EmptyState
          icon={ClipboardList}
          title="No tasks yet"
          description="Create your first task to get started with the board"
          actionLabel="Create task"
          onAction={() => setCreateDialogOpen(true)}
          className="flex-1"
        />
        {defaultProjectId && (
          <TaskCreateDialog
            open={createDialogOpen}
            onOpenChange={handleCreateDialogOpenChange}
            onSubmit={handleCreateTaskFromDialog}
            projectId={defaultProjectId}
            allTags={tagsList}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <BoardToolbar
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        filter={filter}
        onFilterChange={setFilter}
        tags={tagsList}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-4">
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              id={col.id}
              name={col.name}
              color={col.color}
              tasks={grouped.get(col.id) ?? []}
              allTasks={allTasks}
              filteredIds={filteredIds}
              collapsed={collapsedColumns.has(col.id)}
              onToggleCollapse={() => toggleCollapse(col.id)}
              onTaskClick={handleTaskClick}
              onTaskDoubleClick={handleTaskDoubleClick}
              onNewTaskForProject={handleNewTaskForProject}
              selectedTaskId={selectedTaskId}
              isDragOver={overColumnId === col.id}
              projectColorMap={projectColorMap}
              subGroups={groupBy === 'project-status' ? buildSubGroups(grouped.get(col.id) ?? []) : undefined}
              projectGroups={groupBy === 'status' ? buildProjectGroups(grouped.get(col.id) ?? [], projects) : undefined}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && <BoardCardOverlay task={activeTask} projectColor={projectColorMap.get(activeTask.project_id)} />}
        </DragOverlay>
      </DndContext>

      {defaultProjectId && (
        <TaskCreateDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateTaskFromDialog}
          projectId={defaultProjectId}
          allTags={tagsList}
        />
      )}
    </div>
  );
}
