import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTaskStore } from '@/stores/task-store';
import { useTagStore } from '@/stores/tag-store';
import { useProjectStore } from '@/stores/project-store';
import { useUIStore } from '@/stores/ui-store';
import { EmptyState } from '@/components/common/EmptyState';
import { ListToolbar, type GroupBy } from './ListToolbar';
import { TaskTable } from './TaskTable';
import { TaskCreateDialog } from '@/components/task/TaskCreateDialog';
import { EMPTY_FILTER, type FilterState } from '@/components/filter/FilterToolbar';
import { ListChecks, Search } from 'lucide-react';
import type { TaskWithTags, TaskStatus, TaskPriority, CreateTaskInput } from '@/types/task';

function applyFilter(tasks: TaskWithTags[], filter: FilterState): TaskWithTags[] {
  let result = tasks;

  if (filter.search) {
    const lower = filter.search.toLowerCase();
    result = result.filter((t) => t.title.toLowerCase().includes(lower));
  }

  if (filter.statuses.length > 0) {
    result = result.filter((t) => filter.statuses.includes(t.status));
  }

  if (filter.priorities.length > 0) {
    result = result.filter((t) => filter.priorities.includes(t.priority));
  }

  if (filter.tagIds.length > 0) {
    result = result.filter((t) =>
      t.tags.some((tag) => filter.tagIds.includes(tag.id)),
    );
  }

  if (filter.unscheduled) {
    result = result.filter((t) => !t.start_date && !t.due_date);
  }

  return result;
}

export function ListView() {
  const allTasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const createTask = useTaskStore((s) => s.createTask);
  const loading = useTaskStore((s) => s.loading);

  const selectedProjectIds = useUIStore((s) => s.selectedProjectIds);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const pendingListFilter = useUIStore((s) => s.pendingListFilter);
  const setPendingListFilter = useUIStore((s) => s.setPendingListFilter);
  const setSelectedProjectIds = useUIStore((s) => s.setSelectedProjectIds);

  const projects = useProjectStore((s) => s.projects);
  const tags = useTagStore((s) => s.tags);
  const fetchTags = useTagStore((s) => s.fetchTags);

  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [groupBy, setGroupBy] = useState<GroupBy>('project');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchTags();
  }, [fetchTasks, fetchTags]);

  // Consume pending filter from cross-view navigation (e.g. Gantt unscheduled badge)
  useEffect(() => {
    if (!pendingListFilter) return;
    setSelectedProjectIds([pendingListFilter.projectId]);
    if (pendingListFilter.unscheduled) {
      setFilter((f) => ({ ...f, unscheduled: true }));
    }
    setPendingListFilter(null);
  }, [pendingListFilter, setPendingListFilter, setSelectedProjectIds]);

  // Filter by selected projects
  const projectTasks = useMemo(
    () => allTasks.filter((t) => selectedProjectIds.includes(t.project_id)),
    [allTasks, selectedProjectIds],
  );

  const filteredTasks = useMemo(() => applyFilter(projectTasks, filter), [projectTasks, filter]);

  const hasActiveFilters =
    filter.search !== '' ||
    filter.statuses.length > 0 ||
    filter.priorities.length > 0 ||
    filter.tagIds.length > 0 ||
    filter.unscheduled;

  const handleUpdateTask = useCallback(
    (id: string, field: string, value: any) => {
      updateTask(id, { [field]: value });
    },
    [updateTask],
  );

  const handleDeleteTask = useCallback(
    (id: string) => {
      deleteTask(id);
    },
    [deleteTask],
  );

  const handleBatchUpdateStatus = useCallback(
    (ids: string[], status: TaskStatus) => {
      for (const id of ids) {
        updateTask(id, { status });
      }
    },
    [updateTask],
  );

  const handleBatchUpdatePriority = useCallback(
    (ids: string[], priority: TaskPriority) => {
      for (const id of ids) {
        updateTask(id, { priority });
      }
    },
    [updateTask],
  );

  const handleBatchDelete = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        deleteTask(id);
      }
    },
    [deleteTask],
  );

  const defaultProjectId = selectedProjectIds[0] ?? projects.find((p) => p.status === 'active')?.id ?? '';

  const handleCreateTaskFromDialog = useCallback(
    (input: CreateTaskInput) => {
      createTask(input);
    },
    [createTask],
  );

  const handleOpenCreateDialog = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleOpenDetail = useCallback(
    (id: string) => {
      openDetailPanel(id);
    },
    [openDetailPanel],
  );

  // Find active project for display purposes (first selected)
  const activeProject = projects.find((p) => p.id === selectedProjectIds[0]);

  // Build project lookup maps
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.color);
    }
    return map;
  }, [projects]);

  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projects]);

  if (!loading && projectTasks.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <ListToolbar
          filter={filter}
          onFilterChange={setFilter}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          tags={tags}
          onCreateTask={handleOpenCreateDialog}
        />
        <EmptyState
          icon={ListChecks}
          title="No tasks yet"
          description="Create your first task to get started"
          actionLabel="Create task"
          onAction={() => setCreateDialogOpen(true)}
          className="flex-1"
        />
        <TaskCreateDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateTaskFromDialog}
          projectId={defaultProjectId}
          allTags={tags}
        />
      </div>
    );
  }

  if (!loading && hasActiveFilters && filteredTasks.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <ListToolbar
          filter={filter}
          onFilterChange={setFilter}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          tags={tags}
          onCreateTask={handleOpenCreateDialog}
        />
        <EmptyState
          icon={Search}
          title="No matching tasks"
          description="Try adjusting your filters"
          actionLabel="Clear filters"
          onAction={() => setFilter(EMPTY_FILTER)}
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ListToolbar
        filter={filter}
        onFilterChange={setFilter}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        tags={tags}
      />
      <TaskTable
        tasks={filteredTasks}
        allTags={tags}
        groupBy={groupBy}
        projectName={activeProject?.name}
        projectColor={activeProject?.color}
        projectColorMap={projectColorMap}
        projectNameMap={projectNameMap}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        onBatchUpdateStatus={handleBatchUpdateStatus}
        onBatchUpdatePriority={handleBatchUpdatePriority}
        onBatchDelete={handleBatchDelete}
        onOpenDetail={handleOpenDetail}
        onOpenCreateDialog={handleOpenCreateDialog}
      />
      <TaskCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateTaskFromDialog}
        projectId={defaultProjectId}
        allTags={tags}
      />
    </div>
  );
}
