import { useState, useCallback, useMemo, useEffect } from 'react';
import { ClipboardList, SearchX } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useProjectStore } from '@/stores/project-store';
import { useUIStore } from '@/stores/ui-store';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProjectCreateDialog } from '@/components/project/ProjectCreateDialog';
import { ProjectEditDialog } from '@/components/project/ProjectEditDialog';
import { ProjectRow } from './ProjectRow';
import {
  ProjectListToolbar,
  type ProjectStatusFilter,
  type ProjectSortOption,
} from './ProjectListToolbar';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import type { ProjectWithStats, CreateProjectInput, UpdateProjectInput } from '@/types/project';

export function ProjectListView() {
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const reorderProjects = useProjectStore((s) => s.reorderProjects);

  const openDetailPanel = useUIStore((s) => s.openDetailPanel);

  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all');
  const [sortOption, setSortOption] = useState<ProjectSortOption>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = useState(-1);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState<{ open: boolean; project: ProjectWithStats | null }>({
    open: false,
    project: null,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; project: ProjectWithStats | null }>({
    open: false,
    project: null,
  });
  const [archiveConfirm, setArchiveConfirm] = useState<{ open: boolean; project: ProjectWithStats | null }>({
    open: false,
    project: null,
  });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter((p) => p.status === 'active');
    } else if (statusFilter === 'archived') {
      result = result.filter((p) => p.status === 'archived');
    } else if (statusFilter === 'completed') {
      result = result.filter(
        (p) => p.total_tasks > 0 && p.completed_tasks === p.total_tasks,
      );
    } else {
      // 'all' excludes archived
      result = result.filter((p) => p.status !== 'archived');
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }

    // Sort
    switch (sortOption) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        result.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case 'updated':
        result.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        break;
      case 'progress': {
        const progress = (p: ProjectWithStats) =>
          p.total_tasks === 0 ? 0 : p.completed_tasks / p.total_tasks;
        result.sort((a, b) => progress(b) - progress(a));
        break;
      }
      default:
        result.sort((a, b) => a.sort_order - b.sort_order);
        break;
    }

    return result;
  }, [projects, statusFilter, searchQuery, sortOption]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCreateProject = useCallback(
    async (input: CreateProjectInput) => {
      await createProject(input);
    },
    [createProject],
  );

  const handleEditProject = useCallback(
    async (id: string, input: UpdateProjectInput) => {
      await updateProject(id, input);
      await fetchProjects();
    },
    [updateProject, fetchProjects],
  );

  const handleDeleteProject = useCallback(async () => {
    if (deleteConfirm.project) {
      await deleteProject(deleteConfirm.project.id);
    }
  }, [deleteConfirm.project, deleteProject]);

  const handleArchiveProject = useCallback(async () => {
    if (archiveConfirm.project) {
      const newStatus = archiveConfirm.project.status === 'archived' ? 'active' : 'archived';
      await updateProject(archiveConfirm.project.id, { status: newStatus });
      await fetchProjects();
    }
  }, [archiveConfirm.project, updateProject, fetchProjects]);

  const handleTaskClick = useCallback(
    (taskId: string) => {
      openDetailPanel(taskId);
    },
    [openDetailPanel],
  );

  // DnD handler - only enabled when using default sort order
  const canDragReorder = sortOption === 'default' && !searchQuery;
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = filteredProjects.findIndex((p) => p.id === active.id);
      const newIdx = filteredProjects.findIndex((p) => p.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        const newOrder = arrayMove(
          filteredProjects.map((p) => p.id),
          oldIdx,
          newIdx,
        );
        await reorderProjects(newOrder);
      }
    },
    [filteredProjects, reorderProjects],
  );

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 'j',
          handler: () =>
            setFocusIndex((prev) => Math.min(prev + 1, filteredProjects.length - 1)),
        },
        {
          key: 'k',
          handler: () => setFocusIndex((prev) => Math.max(prev - 1, 0)),
        },
        {
          key: 'ArrowRight',
          handler: () => {
            if (focusIndex >= 0 && focusIndex < filteredProjects.length) {
              const id = filteredProjects[focusIndex].id;
              setExpandedIds((prev) => new Set(prev).add(id));
            }
          },
        },
        {
          key: 'ArrowLeft',
          handler: () => {
            if (focusIndex >= 0 && focusIndex < filteredProjects.length) {
              const id = filteredProjects[focusIndex].id;
              setExpandedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }
          },
        },
      ],
      [filteredProjects, focusIndex],
    ),
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-muted-foreground">Loading projects...</span>
      </div>
    );
  }

  const hasNoProjects = projects.length === 0;
  const hasNoResults = !hasNoProjects && filteredProjects.length === 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
        {/* Toolbar */}
        <div className="mb-4">
          <ProjectListToolbar
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sortOption={sortOption}
            onSortChange={setSortOption}
            onSearch={setSearchQuery}
            onCreateProject={() => setCreateDialogOpen(true)}
          />
        </div>

        {/* Content */}
        {hasNoProjects ? (
          <EmptyState
            icon={ClipboardList}
            title="Create your first project"
            description="Start using Clotho to manage your tasks and schedule"
            actionLabel="Create Project"
            onAction={() => setCreateDialogOpen(true)}
          />
        ) : hasNoResults ? (
          <EmptyState
            icon={SearchX}
            title="No matching projects found"
            description="Try different keywords or adjust your filters"
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredProjects.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
              disabled={!canDragReorder}
            >
              <div className="rounded-lg border">
                {filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    expanded={expandedIds.has(project.id)}
                    onToggleExpand={() => toggleExpand(project.id)}
                    onEdit={() => setEditDialog({ open: true, project })}
                    onArchive={() => setArchiveConfirm({ open: true, project })}
                    onDelete={() => setDeleteConfirm({ open: true, project })}
                    onTaskClick={handleTaskClick}
                    isDraggable={canDragReorder}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Create dialog */}
        <ProjectCreateDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateProject}
        />

        {/* Edit dialog */}
        <ProjectEditDialog
          open={editDialog.open}
          onOpenChange={(open) => setEditDialog((prev) => ({ ...prev, open }))}
          project={editDialog.project}
          onSubmit={handleEditProject}
        />

        {/* Delete confirm */}
        <ConfirmDialog
          open={deleteConfirm.open}
          onOpenChange={(open) => setDeleteConfirm((prev) => ({ ...prev, open }))}
          title="Delete project"
          description={`Are you sure you want to delete "${deleteConfirm.project?.name}"? This will delete all tasks in this project. You can recover it within 30 days.`}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteProject}
        />

        {/* Archive confirm */}
        <ConfirmDialog
          open={archiveConfirm.open}
          onOpenChange={(open) => setArchiveConfirm((prev) => ({ ...prev, open }))}
          title={archiveConfirm.project?.status === 'archived' ? 'Unarchive project' : 'Archive project'}
          description={
            archiveConfirm.project?.status === 'archived'
              ? `Unarchive "${archiveConfirm.project?.name}"? It will be moved back to active projects.`
              : `Archive "${archiveConfirm.project?.name}"? It will be moved to the "Archived" category. You can unarchive it anytime.`
          }
          confirmLabel={archiveConfirm.project?.status === 'archived' ? 'Unarchive' : 'Archive'}
          onConfirm={handleArchiveProject}
        />
        </div>
      </div>
    </TooltipProvider>
  );
}
