import { useEffect, useState, useCallback, useRef } from 'react';
import { Type, Code, Check, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TaskImageSection } from '@/components/task/TaskImageSection';
import { TaskForm } from '@/components/task/TaskForm';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUIStore } from '@/stores/ui-store';
import { useTaskStore } from '@/stores/task-store';
import { useTagStore } from '@/stores/tag-store';
import { taskService } from '@/services/task-service';
import type { TaskDetail, TaskStatus, TaskPriority, TaskDifficulty, DescriptionFormat } from '@/types/task';
import { VisuallyHidden } from 'radix-ui';

export function TaskDetailPanel() {
  const open = useUIStore((s) => s.detailPanelOpen);
  const taskId = useUIStore((s) => s.detailPanelTaskId);
  const closePanel = useUIStore((s) => s.closeDetailPanel);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const allTags = useTagStore((s) => s.tags);

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [showFormatChooser, setShowFormatChooser] = useState(false);

  // Fetch task detail when taskId changes
  useEffect(() => {
    if (taskId) {
      setLoading(true);
      taskService
        .get(taskId)
        .then(setTask)
        .catch(() => setTask(null))
        .finally(() => setLoading(false));
    } else {
      setTask(null);
    }
  }, [taskId]);

  useEffect(() => {
    if (task) {
      setTitleValue(task.title);
      setDescriptionValue(task.description ?? '');
      setEditingTitle(false);
      setEditingDescription(false);
      setShowFormatChooser(false);
    }
  }, [task]);

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (task && titleValue !== task.title && titleValue.trim()) {
      updateTask(task.id, { title: titleValue.trim() });
      setTask({ ...task, title: titleValue.trim() });
    }
  };

  const handleDescriptionBlur = () => {
    if (task && descriptionValue !== (task.description ?? '')) {
      updateTask(task.id, { description: descriptionValue || undefined });
      setTask({ ...task, description: descriptionValue || null });
      showSaved();
    }
  };

  const handleDescriptionClick = () => {
    if (!task) return;
    if (task.description_format === null) {
      setShowFormatChooser(true);
    } else {
      setEditingDescription(true);
    }
  };

  const handleFormatSelect = (fmt: DescriptionFormat) => {
    if (!task) return;
    setShowFormatChooser(false);
    updateTask(task.id, { description_format: fmt });
    setTask({ ...task, description_format: fmt });
    setEditingDescription(true);
  };

  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showSaved = useCallback(() => {
    setSaveIndicator('saved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveIndicator('idle'), 2000);
  }, []);

  const handleFormChange = (update: Partial<{ status: TaskStatus; priority: TaskPriority; difficulty: TaskDifficulty | null; startDate: string | null; dueDate: string | null; tagIds: string[]; estimatedHours: number | null; actualHours: number | null }>) => {
    if (!task) return;
    if (update.status !== undefined) {
      updateTask(task.id, { status: update.status });
      setTask({ ...task, status: update.status });
    }
    if (update.priority !== undefined) {
      updateTask(task.id, { priority: update.priority });
      setTask({ ...task, priority: update.priority });
    }
    if ('difficulty' in update) {
      updateTask(task.id, { difficulty: update.difficulty });
      setTask({ ...task, difficulty: update.difficulty ?? null });
    }
    if ('startDate' in update) {
      updateTask(task.id, { start_date: update.startDate });
      setTask({ ...task, start_date: update.startDate ?? null });
    }
    if ('dueDate' in update) {
      updateTask(task.id, { due_date: update.dueDate });
      setTask({ ...task, due_date: update.dueDate ?? null });
    }
    if (update.tagIds !== undefined) {
      const nextIds = update.tagIds;
      updateTask(task.id, { tag_ids: nextIds });
      const nextTags = allTags.filter((t) => nextIds.includes(t.id));
      setTask({ ...task, tags: nextTags });
    }
    if ('estimatedHours' in update) {
      updateTask(task.id, { estimated_hours: update.estimatedHours });
      setTask({ ...task, estimated_hours: update.estimatedHours ?? null });
    }
    if ('actualHours' in update) {
      updateTask(task.id, { actual_hours: update.actualHours });
      setTask({ ...task, actual_hours: update.actualHours ?? null });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) closePanel(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl h-[80vh] min-w-[640px] min-h-[480px] flex flex-col p-0 gap-0"
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          const target = e.target as HTMLElement;
          if (
            (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'j', 'k', 'h', 'l'].includes(e.key)
          ) {
            e.stopPropagation();
          }
        }}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Task Detail</DialogTitle>
        </VisuallyHidden.Root>

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-muted-foreground">Loading...</span>
          </div>
        ) : task ? (
          <div className="flex h-full flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
              {editingTitle ? (
                <Input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleBlur();
                    if (e.key === 'Escape') {
                      setEditingTitle(false);
                      setTitleValue(task.title);
                    }
                  }}
                  autoFocus
                  className="text-lg font-semibold flex-1"
                />
              ) : (
                <h2
                  className="cursor-pointer text-lg font-semibold hover:bg-muted/50 rounded px-1 -mx-1 flex-1"
                  onClick={() => setEditingTitle(true)}
                >
                  {task.title}
                </h2>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-2 shrink-0" onClick={closePanel}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Metadata row */}
            <div className="border-b px-6 py-3 shrink-0">
              <TaskForm
                value={{
                  status: task.status as TaskStatus,
                  priority: task.priority as TaskPriority,
                  difficulty: task.difficulty as TaskDifficulty | null,
                  startDate: task.start_date,
                  dueDate: task.due_date,
                  tagIds: task.tags.map((t) => t.id),
                  estimatedHours: task.estimated_hours,
                  actualHours: task.actual_hours,
                }}
                onChange={handleFormChange}
                allTags={allTags}
                showActualHours
              />
            </div>

            {/* Main scrollable content */}
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-6">
                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Description
                      {task.description_format && (
                        <span className="ml-1.5 text-[10px] opacity-60 uppercase">{task.description_format}</span>
                      )}
                    </label>
                    {saveIndicator === 'saved' && (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 animate-in fade-in duration-200">
                        <Check className="h-3 w-3" />
                        Saved
                      </span>
                    )}
                  </div>

                  {showFormatChooser ? (
                    <div className="flex gap-2 p-4 border rounded-md bg-muted/30">
                      <Button
                        variant="outline"
                        className="flex-1 h-auto flex-col gap-1.5 py-4"
                        onClick={() => handleFormatSelect('richtext')}
                      >
                        <Type className="h-5 w-5" />
                        <span className="text-sm font-medium">Rich Text</span>
                        <span className="text-xs text-muted-foreground">WYSIWYG editor</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-auto flex-col gap-1.5 py-4"
                        onClick={() => handleFormatSelect('markdown')}
                      >
                        <Code className="h-5 w-5" />
                        <span className="text-sm font-medium">Markdown</span>
                        <span className="text-xs text-muted-foreground">Plain text with syntax</span>
                      </Button>
                    </div>
                  ) : editingDescription ? (
                    task.description_format === 'markdown' ? (
                      <textarea
                        value={descriptionValue}
                        onChange={(e) => setDescriptionValue(e.target.value)}
                        onBlur={handleDescriptionBlur}
                        autoFocus
                        placeholder="Write markdown here..."
                        className="w-full min-h-[160px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    ) : (
                      <RichTextEditor
                        value={descriptionValue}
                        onChange={setDescriptionValue}
                        onBlur={handleDescriptionBlur}
                        placeholder="Add a description..."
                        className="min-h-[160px]"
                      />
                    )
                  ) : (
                    <div
                      className="cursor-pointer rounded px-1 -mx-1 py-1 text-sm hover:bg-muted/50 min-h-[80px]"
                      onClick={handleDescriptionClick}
                    >
                      {task.description ? (
                        <RichTextEditor
                          value={task.description}
                          onChange={() => {}}
                          readOnly
                        />
                      ) : (
                        <span className="text-muted-foreground">Add a description...</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Images */}
                <TaskImageSection taskId={task.id} />

                <Separator />

                {/* Subtasks */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Subtasks ({task.subtasks.filter((s) => s.status === 'done').length}/{task.subtasks.length})
                    </label>
                    <div className="space-y-1">
                      {task.subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                        >
                          <StatusBadge status={subtask.status} showLabel={false} />
                          <span
                            className={cn(
                              'flex-1 text-sm',
                              subtask.status === 'done' && 'line-through text-muted-foreground',
                            )}
                          >
                            {subtask.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t px-6 py-3 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete task
              </Button>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete task?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{task.title}". This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => {
                      deleteTask(task.id);
                      closePanel();
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
