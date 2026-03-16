import { useState, useCallback, useMemo, useRef } from 'react';
import { type SortingState, type RowSelectionState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { TitleCell } from './cells/TitleCell';
import { StatusCell } from './cells/StatusCell';
import { PriorityCell } from './cells/PriorityCell';
import { DateCell } from './cells/DateCell';
import { TagsCell } from './cells/TagsCell';
import { GroupHeader } from './GroupHeader';
import { BatchActionBar } from './BatchActionBar';
import { TaskContextMenu } from '@/components/task/TaskContextMenu';
import { ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/constants';
import type { TaskWithTags, TaskStatus, TaskPriority } from '@/types/task';
import type { Tag } from '@/types/tag';
import type { ProjectWithStats } from '@/types/project';
import type { GroupBy } from './ListToolbar';

interface TaskTableProps {
  tasks: TaskWithTags[];
  allTags: Tag[];
  groupBy: GroupBy;
  projects?: ProjectWithStats[];
  projectName?: string;
  projectColor?: string;
  projectColorMap?: Map<string, string>;
  projectNameMap?: Map<string, string>;
  onUpdateTask: (id: string, field: string, value: any) => void;
  onDeleteTask: (id: string) => void;
  onBatchUpdateStatus: (ids: string[], status: TaskStatus) => void;
  onBatchUpdatePriority: (ids: string[], priority: TaskPriority) => void;
  onBatchDelete: (ids: string[]) => void;
  onOpenDetail: (id: string) => void;
  onOpenCreateDialog?: () => void;
  onReorderTasks?: (taskIds: string[]) => void;
}

type EditingCell = {
  rowId: string;
  column: 'title' | 'status' | 'priority' | 'dueDate' | 'tags';
} | null;

const EDITABLE_COLUMNS = ['title', 'status', 'priority', 'dueDate', 'tags'] as const;

const STATUS_ORDER: Record<TaskStatus, number> = {
  unscheduled: 0,
  todo: 1,
  in_progress: 2,
  done: 3,
  cancelled: 4,
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isCompletedStatus(status: TaskStatus): boolean {
  return status === 'done' || status === 'cancelled';
}

interface SortableTaskRowProps {
  task: TaskWithTags;
  disabled: boolean;
  className: string;
  style?: React.CSSProperties;
  onDoubleClick: () => void;
  children: React.ReactNode;
}

function SortableTaskRow({
  task,
  disabled,
  className,
  style,
  onDoubleClick,
  children,
}: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled,
    data: {
      type: 'Task',
      task,
    },
  });

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(className, isDragging && 'opacity-70')}
      style={{ ...style, ...dndStyle }}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}

export function TaskTable({
  tasks,
  allTags,
  groupBy,
  projects,
  projectName,
  projectColor,
  projectColorMap,
  projectNameMap,
  onUpdateTask,
  onDeleteTask,
  onBatchUpdateStatus,
  onBatchUpdatePriority,
  onBatchDelete,
  onOpenDetail,
  onOpenCreateDialog,
  onReorderTasks,
}: TaskTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [lastClickedRow, setLastClickedRow] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Build flat list with parent/child hierarchy
  const { flatTasks, taskMeta } = useMemo(() => {
    const topLevel = tasks.filter((t) => !t.parent_task_id);
    const childMap = new Map<string, TaskWithTags[]>();
    for (const t of tasks) {
      if (t.parent_task_id) {
        const arr = childMap.get(t.parent_task_id) ?? [];
        arr.push(t);
        childMap.set(t.parent_task_id, arr);
      }
    }

    const flat: TaskWithTags[] = [];
    const meta = new Map<string, { depth: number; hasChildren: boolean; childCount: number }>();

    function addTask(task: TaskWithTags, depth: number) {
      const children = childMap.get(task.id) ?? [];
      meta.set(task.id, { depth, hasChildren: children.length > 0, childCount: children.length });
      flat.push(task);
      if (expandedTasks.has(task.id) || (depth === 0 && !expandedTasks.has(`collapsed:${task.id}`))) {
        for (const child of children) {
          addTask(child, depth + 1);
        }
      }
    }

    for (const t of topLevel) {
      addTask(t, 0);
    }

    return { flatTasks: flat, taskMeta: meta };
  }, [tasks, expandedTasks]);

  // Group tasks
  const groups = useMemo(() => {
    if (groupBy === 'none') return null;

    if (groupBy === 'project') {
      const projectGroups = new Map<string, TaskWithTags[]>();
      for (const t of flatTasks) {
        const pid = t.project_id;
        if (!projectGroups.has(pid)) {
          projectGroups.set(pid, []);
        }
        projectGroups.get(pid)!.push(t);
      }
      // Use projects array order (sorted by sort_order from backend) if available
      if (projects && projects.length > 0) {
        return projects
          .filter((p) => projectGroups.has(p.id))
          .map((p) => ({
            key: p.id,
            label: p.name,
            color: p.color ?? '#D1D5DB',
            tasks: projectGroups.get(p.id)!,
          }));
      }
      // Fallback: use Map iteration order
      return Array.from(projectGroups.entries()).map(([pid, tasks]) => ({
        key: pid,
        label: projectNameMap?.get(pid) ?? 'Unknown Project',
        color: projectColorMap?.get(pid) ?? '#D1D5DB',
        tasks,
      }));
    }

    if (groupBy === 'status') {
      return TASK_STATUSES.map((s) => ({
        key: s.value,
        label: s.label,
        color: s.color,
        tasks: flatTasks.filter((t) => t.status === s.value),
      }));
    }

    if (groupBy === 'priority') {
      return TASK_PRIORITIES.map((p) => ({
        key: p.value,
        label: p.label,
        color: p.color,
        tasks: flatTasks.filter((t) => t.priority === p.value),
      }));
    }

    return null;
  }, [groupBy, flatTasks, projects, projectNameMap, projectColorMap]);

  // Build virtual rows
  type VirtualRow =
    | { type: 'group-header'; key: string; label: string; color?: string; count: number }
    | { type: 'task'; task: TaskWithTags; groupKey: string }
    | { type: 'inline-create'; groupDefaults?: { status?: TaskStatus; priority?: TaskPriority } };

  const virtualRows = useMemo<VirtualRow[]>(() => {
    const rows: VirtualRow[] = [];

    if (groups) {
      for (const group of groups) {
        rows.push({
          type: 'group-header',
          key: group.key,
          label: group.label,
          color: group.color,
          count: group.tasks.length,
        });
        if (!collapsedGroups.has(group.key)) {
          for (const task of group.tasks) {
            rows.push({ type: 'task', task, groupKey: group.key });
          }
          const defaults: any = {};
          if (groupBy === 'status') defaults.status = group.key as TaskStatus;
          if (groupBy === 'priority') defaults.priority = group.key as TaskPriority;
          rows.push({ type: 'inline-create', groupDefaults: defaults });
        }
      }
    } else {
      for (const task of flatTasks) {
        rows.push({ type: 'task', task, groupKey: '__ungrouped' });
      }
      rows.push({ type: 'inline-create' });
    }

    return rows;
  }, [groups, flatTasks, collapsedGroups, groupBy]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const row = virtualRows[index];
      if (row.type === 'group-header') return 36;
      return 40;
    },
    overscan: 5,
  });

  const topLevelTasks = useMemo(
    () => tasks.filter((task) => !task.parent_task_id),
    [tasks],
  );

  const topLevelTaskIds = useMemo(
    () => topLevelTasks.map((task) => task.id),
    [topLevelTasks],
  );

  const topLevelTaskMap = useMemo(
    () => new Map(topLevelTasks.map((task) => [task.id, task] as const)),
    [topLevelTasks],
  );

  const taskGroupKeyMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!groups) {
      for (const task of topLevelTasks) {
        map.set(task.id, '__ungrouped');
      }
      return map;
    }

    for (const group of groups) {
      for (const task of group.tasks) {
        if (!task.parent_task_id) {
          map.set(task.id, group.key);
        }
      }
    }
    return map;
  }, [groups, topLevelTasks]);

  const reorderEnabled = sorting.length === 0 && !editingCell && !!onReorderTasks;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!reorderEnabled || !onReorderTasks) return;

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeTask = topLevelTaskMap.get(activeId);
    const overTask = topLevelTaskMap.get(overId);
    if (!activeTask || !overTask) return;

    const activeGroupKey = taskGroupKeyMap.get(activeId);
    const overGroupKey = taskGroupKeyMap.get(overId);
    if (!activeGroupKey || !overGroupKey || activeGroupKey !== overGroupKey) return;

    const groupTaskIds = topLevelTasks
      .filter((task) => taskGroupKeyMap.get(task.id) === activeGroupKey)
      .map((task) => task.id);

    const oldIndex = groupTaskIds.indexOf(activeId);
    const newIndex = groupTaskIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const movedGroupTaskIds = arrayMove(groupTaskIds, oldIndex, newIndex);
    const activeIds = movedGroupTaskIds.filter((id) => !isCompletedStatus(topLevelTaskMap.get(id)!.status));
    const completedIds = movedGroupTaskIds.filter((id) => isCompletedStatus(topLevelTaskMap.get(id)!.status));
    const normalizedGroupTaskIds = [...activeIds, ...completedIds];

    const groupTaskSet = new Set(groupTaskIds);
    let pointer = 0;
    const reorderedTopLevelIds = topLevelTaskIds.map((id) => {
      if (!groupTaskSet.has(id)) return id;
      const next = normalizedGroupTaskIds[pointer];
      pointer += 1;
      return next;
    });

    const reorderedActive = reorderedTopLevelIds.filter((id) => !isCompletedStatus(topLevelTaskMap.get(id)!.status));
    const reorderedCompleted = reorderedTopLevelIds.filter((id) => isCompletedStatus(topLevelTaskMap.get(id)!.status));
    onReorderTasks([...reorderedActive, ...reorderedCompleted]);
  }, [onReorderTasks, reorderEnabled, taskGroupKeyMap, topLevelTaskIds, topLevelTaskMap, topLevelTasks]);

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      const collapseKey = `collapsed:${taskId}`;
      if (next.has(taskId)) {
        next.delete(taskId);
      } else if (next.has(collapseKey)) {
        next.delete(collapseKey);
      } else {
        // First-level tasks are expanded by default, toggle to collapsed
        next.add(collapseKey);
      }
      // For deeper tasks, toggle expand
      next.add(taskId);
      return next;
    });
  }, []);

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const startEdit = useCallback((rowId: string, column: EditingCell extends null ? never : NonNullable<EditingCell>['column']) => {
    setEditingCell({ rowId, column });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const tabToNext = useCallback((rowId: string, currentColumn: string) => {
    const idx = EDITABLE_COLUMNS.indexOf(currentColumn as any);
    if (idx < EDITABLE_COLUMNS.length - 1) {
      setEditingCell({ rowId, column: EDITABLE_COLUMNS[idx + 1] });
    } else {
      setEditingCell(null);
    }
  }, []);

  // Selection helpers
  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection).filter((k) => rowSelection[k]);
  }, [rowSelection]);

  const handleCheckboxClick = useCallback(
    (taskId: string, rowIndex: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedRow !== null) {
        const start = Math.min(lastClickedRow, rowIndex);
        const end = Math.max(lastClickedRow, rowIndex);
        const newSelection = { ...rowSelection };
        for (let i = start; i <= end; i++) {
          const row = virtualRows[i];
          if (row.type === 'task') {
            newSelection[row.task.id] = true;
          }
        }
        setRowSelection(newSelection);
      } else {
        setRowSelection((prev) => ({
          ...prev,
          [taskId]: !prev[taskId],
        }));
      }
      setLastClickedRow(rowIndex);
    },
    [lastClickedRow, rowSelection, virtualRows],
  );

  const allTaskIds = useMemo(() => {
    return virtualRows
      .filter((r): r is Extract<VirtualRow, { type: 'task' }> => r.type === 'task')
      .map((r) => r.task.id);
  }, [virtualRows]);

  const allSelected = allTaskIds.length > 0 && allTaskIds.every((id) => rowSelection[id]);
  const someSelected = allTaskIds.some((id) => rowSelection[id]);

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setRowSelection({});
    } else {
      const sel: RowSelectionState = {};
      for (const id of allTaskIds) {
        sel[id] = true;
      }
      setRowSelection(sel);
    }
  }, [allSelected, allTaskIds]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingCell) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        setRowSelection({});
        return;
      }
    },
    [editingCell],
  );

  const sortIndicator = (columnId: string) => {
    const sort = sorting.find((s) => s.id === columnId);
    if (!sort) return null;
    return sort.desc ? (
      <ArrowDown className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowUp className="h-3 w-3 inline ml-1" />
    );
  };

  const handleSort = (columnId: string) => {
    setSorting((prev) => {
      const existing = prev.find((s) => s.id === columnId);
      if (!existing) return [{ id: columnId, desc: false }];
      if (!existing.desc) return [{ id: columnId, desc: true }];
      return [];
    });
  };

  // Apply sorting to tasks within groups or flat list
  const sortedVirtualRows = useMemo(() => {
    if (sorting.length === 0) return virtualRows;

    const sort = sorting[0];
    const compareFn = (a: TaskWithTags, b: TaskWithTags): number => {
      let cmp = 0;
      switch (sort.id) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'status':
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
        case 'priority':
          cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
          break;
        case 'dueDate':
          cmp = (a.due_date ?? '').localeCompare(b.due_date ?? '');
          break;
        case 'project':
          cmp = 0; // Same project in project view
          break;
      }
      return sort.desc ? -cmp : cmp;
    };

    // Sort task rows within groups while preserving group headers and inline creates
    const result: VirtualRow[] = [];
    let currentGroup: VirtualRow[] = [];

    for (const row of virtualRows) {
      if (row.type === 'group-header') {
        if (currentGroup.length > 0) {
          const tasks = currentGroup.filter((r): r is Extract<VirtualRow, { type: 'task' }> => r.type === 'task');
          const others = currentGroup.filter((r) => r.type !== 'task');
          tasks.sort((a, b) => compareFn(a.task, b.task));
          result.push(...tasks, ...others);
          currentGroup = [];
        }
        result.push(row);
      } else {
        currentGroup.push(row);
      }
    }
    if (currentGroup.length > 0) {
      const tasks = currentGroup.filter((r): r is Extract<VirtualRow, { type: 'task' }> => r.type === 'task');
      const others = currentGroup.filter((r) => r.type !== 'task');
      tasks.sort((a, b) => compareFn(a.task, b.task));
      result.push(...tasks, ...others);
    }

    return result;
  }, [virtualRows, sorting]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden" onKeyDown={handleKeyDown} tabIndex={0}>
      {selectedIds.length > 0 && (
        <BatchActionBar
          count={selectedIds.length}
          onStatusChange={(status) => {
            onBatchUpdateStatus(selectedIds, status);
            setRowSelection({});
          }}
          onPriorityChange={(priority) => {
            onBatchUpdatePriority(selectedIds, priority);
            setRowSelection({});
          }}
          onDelete={() => {
            onBatchDelete(selectedIds);
            setRowSelection({});
          }}
          onClear={() => setRowSelection({})}
        />
      )}

      {/* Table header */}
      <div className="flex items-center h-10 border-b bg-muted/30 text-xs font-medium text-muted-foreground select-none shrink-0">
        <div className="w-[32px] flex items-center justify-center shrink-0">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={handleSelectAll}
          />
        </div>
        <div
          className="flex-1 min-w-[200px] px-2 cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort('title')}
        >
          Task name{sortIndicator('title')}
        </div>
        <div
          className="w-[120px] px-2 cursor-pointer hover:text-foreground transition-colors shrink-0"
          onClick={() => handleSort('status')}
        >
          Status{sortIndicator('status')}
        </div>
        <div
          className="w-[100px] px-2 cursor-pointer hover:text-foreground transition-colors shrink-0"
          onClick={() => handleSort('priority')}
        >
          Priority{sortIndicator('priority')}
        </div>
        <div
          className="w-[120px] px-2 cursor-pointer hover:text-foreground transition-colors shrink-0"
          onClick={() => handleSort('dueDate')}
        >
          Due date{sortIndicator('dueDate')}
        </div>
        <div className="w-[150px] px-2 shrink-0">Tags</div>
        <div className="w-[120px] px-2 shrink-0">Project</div>
      </div>

      {/* Virtual scroll container */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={topLevelTaskIds} strategy={verticalListSortingStrategy}>
          <div ref={scrollContainerRef} className="flex-1 overflow-auto">
            <div
              style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const row = sortedVirtualRows[virtualItem.index];

                if (row.type === 'group-header') {
                  return (
                    <div
                      key={`group-${row.key}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualItem.size,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <GroupHeader
                        label={row.label}
                        color={row.color}
                        count={row.count}
                        expanded={!collapsedGroups.has(row.key)}
                        onToggle={() => toggleGroupCollapse(row.key)}
                      />
                    </div>
                  );
                }

                if (row.type === 'inline-create') {
                  return (
                    <div
                      key={`create-${virtualItem.index}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualItem.size,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      className="flex items-center border-b"
                    >
                      <div className="w-[32px] shrink-0" />
                      <div className="flex-1">
                        <button
                          type="button"
                          onClick={onOpenCreateDialog}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          New task
                        </button>
                      </div>
                    </div>
                  );
                }

                const task = row.task;
                const meta = taskMeta.get(task.id);
                const isSelected = rowSelection[task.id];
                const isTopLevel = !task.parent_task_id;
                const rowStyle = !isSelected ? {
                  borderLeftColor: projectColorMap?.get(task.project_id) ?? projectColor ?? 'transparent',
                } : undefined;
                const rowClassName = cn(
                  'flex items-center h-full border-b border-l-2 text-sm hover:bg-muted/50 transition-colors',
                  isSelected ? 'bg-accent/10 border-l-accent' : 'border-l-transparent',
                  isTopLevel && reorderEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                );
                const rowContent = (
                  <>
                    <div className="w-[32px] flex items-center justify-center shrink-0">
                      <Checkbox
                        checked={!!isSelected}
                        onCheckedChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCheckboxClick(task.id, virtualItem.index, e.shiftKey);
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-[200px] px-2 overflow-hidden">
                      <TitleCell
                        task={task}
                        depth={meta?.depth ?? 0}
                        hasChildren={meta?.hasChildren ?? false}
                        expanded={expandedTasks.has(task.id) || (meta?.depth === 0 && !expandedTasks.has(`collapsed:${task.id}`))}
                        childCount={meta?.childCount ?? 0}
                        isEditing={editingCell?.rowId === task.id && editingCell?.column === 'title'}
                        onToggleExpand={() => toggleExpand(task.id)}
                        onSave={(val) => {
                          onUpdateTask(task.id, 'title', val);
                          cancelEdit();
                        }}
                        onStartEdit={() => startEdit(task.id, 'title')}
                        onCancelEdit={cancelEdit}
                        onTabNext={() => tabToNext(task.id, 'title')}
                      />
                    </div>

                    <div className="w-[120px] px-2 shrink-0">
                      <StatusCell
                        status={task.status}
                        isEditing={editingCell?.rowId === task.id && editingCell?.column === 'status'}
                        onSave={(val) => {
                          onUpdateTask(task.id, 'status', val);
                          cancelEdit();
                        }}
                        onStartEdit={() => startEdit(task.id, 'status')}
                        onCancelEdit={cancelEdit}
                        onTabNext={() => tabToNext(task.id, 'status')}
                      />
                    </div>

                    <div className="w-[100px] px-2 shrink-0">
                      <PriorityCell
                        priority={task.priority}
                        isEditing={editingCell?.rowId === task.id && editingCell?.column === 'priority'}
                        onSave={(val) => {
                          onUpdateTask(task.id, 'priority', val);
                          cancelEdit();
                        }}
                        onStartEdit={() => startEdit(task.id, 'priority')}
                        onCancelEdit={cancelEdit}
                        onTabNext={() => tabToNext(task.id, 'priority')}
                      />
                    </div>

                    <div className="w-[120px] px-2 shrink-0">
                      <DateCell
                        date={task.due_date}
                        isEditing={editingCell?.rowId === task.id && editingCell?.column === 'dueDate'}
                        onSave={(val) => {
                          onUpdateTask(task.id, 'due_date', val);
                          cancelEdit();
                        }}
                        onStartEdit={() => startEdit(task.id, 'dueDate')}
                        onCancelEdit={cancelEdit}
                      />
                    </div>

                    <div className="w-[150px] px-2 shrink-0">
                      <TagsCell
                        taskTags={task.tags}
                        allTags={allTags}
                        isEditing={editingCell?.rowId === task.id && editingCell?.column === 'tags'}
                        onSave={(tagIds) => {
                          onUpdateTask(task.id, 'tag_ids', tagIds);
                          cancelEdit();
                        }}
                        onStartEdit={() => startEdit(task.id, 'tags')}
                      />
                    </div>

                    <div className="w-[120px] px-2 shrink-0 flex items-center gap-1.5 overflow-hidden">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: projectColorMap?.get(task.project_id) ?? projectColor ?? '#D1D5DB' }}
                      />
                      <span className="text-sm truncate text-muted-foreground">
                        {projectNameMap?.get(task.project_id) ?? projectName ?? ''}
                      </span>
                    </div>
                  </>
                );

                return (
                  <div
                    key={task.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualItem.size,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <TaskContextMenu
                      onOpen={() => onOpenDetail(task.id)}
                      onStatusChange={(status) => onUpdateTask(task.id, 'status', status)}
                      onPriorityChange={(priority) => onUpdateTask(task.id, 'priority', priority)}
                      onDelete={() => onDeleteTask(task.id)}
                      taskIdForCopy={task.id}
                    >
                      {isTopLevel ? (
                        <SortableTaskRow
                          task={task}
                          disabled={!reorderEnabled}
                          className={rowClassName}
                          style={rowStyle}
                          onDoubleClick={() => {
                            if (!editingCell) onOpenDetail(task.id);
                          }}
                        >
                          {rowContent}
                        </SortableTaskRow>
                      ) : (
                        <div
                          className={rowClassName}
                          style={rowStyle}
                          onDoubleClick={() => {
                            if (!editingCell) onOpenDetail(task.id);
                          }}
                        >
                          {rowContent}
                        </div>
                      )}
                    </TaskContextMenu>
                  </div>
                );
              })}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
