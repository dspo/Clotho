import { useEffect, useState, useCallback, useRef } from 'react';
import { Type, Code, Check, X, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
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
import { tagService } from '@/services/tag-service';
import { useResolvedMarkdown } from '@/hooks/useResolvedMarkdown';
import type { TaskDetail, TaskStatus, TaskPriority, TaskDifficulty, DescriptionFormat, TaskProgress } from '@/types/task';
import type { Tag } from '@/types/tag';
import { VisuallyHidden } from 'radix-ui';

function formatDateTime(value: string): string {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, yyyy HH:mm');
}

export function TaskDetailPanel() {
  const open = useUIStore((s) => s.detailPanelOpen);
  const taskId = useUIStore((s) => s.detailPanelTaskId);
  const closePanel = useUIStore((s) => s.closeDetailPanel);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const allTags = useTagStore((s) => s.tags);
  const fetchTags = useTagStore((s) => s.fetchTags);
  const createTag = useTagStore((s) => s.createTag);

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [showFormatChooser, setShowFormatChooser] = useState(false);
  const [progressItems, setProgressItems] = useState<TaskProgress[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [addingProgress, setAddingProgress] = useState(false);
  const [progressValue, setProgressValue] = useState('');
  const [progressFormat, setProgressFormat] = useState<DescriptionFormat | null>(null);
  const [showProgressFormatChooser, setShowProgressFormatChooser] = useState(false);

  // Resolve image references in markdown (e.g., ![](花束.jpg) -> clotho://image/{id})
  const resolvedDescription = useResolvedMarkdown(task?.id ?? null, task?.description ?? null);

  // Fetch task detail when taskId changes
  useEffect(() => {
    if (taskId) {
      setLoading(true);
      setLoadingProgress(true);
      Promise.all([taskService.get(taskId), taskService.listProgress(taskId)])
        .then(([detail, progress]) => {
          setTask(detail);
          setProgressItems(progress);
        })
        .catch(() => {
          setTask(null);
          setProgressItems([]);
        })
        .finally(() => {
          setLoading(false);
          setLoadingProgress(false);
        });
    } else {
      setTask(null);
      setProgressItems([]);
    }
  }, [taskId]);

  useEffect(() => {
    if (!open || !taskId || allTags.length > 0) return;
    void fetchTags();
  }, [open, taskId, allTags.length, fetchTags]);

  useEffect(() => {
    if (task) {
      setTitleValue(task.title);
      setDescriptionValue(task.description ?? '');
      setEditingTitle(false);
      setEditingDescription(false);
      setShowFormatChooser(false);
      setAddingProgress(false);
      setProgressValue('');
      setProgressFormat(null);
      setShowProgressFormatChooser(false);
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
      // Send empty string explicitly to clear description (undefined would be ignored by backend)
      // Backend stores empty string; we keep local state consistent
      updateTask(task.id, { description: descriptionValue });
      setTask({ ...task, description: descriptionValue || '' });
      showSaved();
    }
    setEditingDescription(false);
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘ Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
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

  const handleAddProgressClick = () => {
    setAddingProgress(true);
    if (progressFormat === null) {
      setShowProgressFormatChooser(true);
    }
  };

  const handleProgressFormatSelect = (fmt: DescriptionFormat) => {
    setProgressFormat(fmt);
    setShowProgressFormatChooser(false);
  };

  const handleSubmitProgress = async () => {
    if (!task) return;
    const content = progressValue.trim();
    if (!content) return;

    const formatToSave = progressFormat ?? task.description_format ?? 'markdown';
    try {
      const created = await taskService.addProgress(task.id, content, formatToSave);
      setProgressItems((prev) => [created, ...prev]);
      setProgressValue('');
      setAddingProgress(false);
      setShowProgressFormatChooser(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateTag = useCallback(async (name: string, color: string): Promise<Tag> => {
    try {
      return await createTag({ name, color });
    } catch (error) {
      const message = String(error).toLowerCase();
      if (message.includes('already exists') || message.includes('conflict')) {
        const latestTags = await tagService.list();
        const existing = latestTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          await fetchTags();
          return existing;
        }
      }
      toast.error('Failed to create tag');
      throw error;
    }
  }, [createTag, fetchTags]);

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
        className="max-w-4xl h-[80vh] max-h-[80vh] min-w-[640px] min-h-[480px] flex flex-col p-0 gap-0 overflow-hidden"
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
                onCreateTag={handleCreateTag}
                showActualHours
              />
            </div>

            {/* Main scrollable content */}
            <ScrollArea className="flex-1 min-h-0">
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
                        onKeyDown={handleDescriptionKeyDown}
                        autoFocus
                        placeholder="Write markdown here..."
                        className="w-full min-h-[160px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    ) : (
                      <RichTextEditor
                        value={descriptionValue}
                        onChange={setDescriptionValue}
                        onSubmit={handleDescriptionBlur}
                        placeholder="Add a description..."
                        className="min-h-[160px]"
                      />
                    )
                  ) : (
                    <div
                      className="rounded px-1 -mx-1 py-1 text-sm min-h-[80px]"
                      onDoubleClick={handleDescriptionClick}
                    >
                      {task.description ? (
                        <RichTextEditor
                          value={resolvedDescription}
                          onChange={() => {}}
                          readOnly
                        />
                      ) : (
                        <span className="text-muted-foreground cursor-pointer" onClick={handleDescriptionClick}>
                          Add a description...
                        </span>
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

                <Separator />

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Progress
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5"
                      onClick={handleAddProgressClick}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Progress
                    </Button>
                  </div>

                  {addingProgress && (
                    <div className="rounded-md border p-3 space-y-2">
                      {showProgressFormatChooser ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 h-auto flex-col gap-1.5 py-3"
                            onClick={() => handleProgressFormatSelect('richtext')}
                          >
                            <Type className="h-4 w-4" />
                            <span className="text-xs font-medium">Rich Text</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 h-auto flex-col gap-1.5 py-3"
                            onClick={() => handleProgressFormatSelect('markdown')}
                          >
                            <Code className="h-4 w-4" />
                            <span className="text-xs font-medium">Markdown</span>
                          </Button>
                        </div>
                      ) : progressFormat === 'markdown' ? (
                        <textarea
                          value={progressValue}
                          onChange={(e) => setProgressValue(e.target.value)}
                          placeholder="Write today's progress..."
                          className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      ) : (
                        <RichTextEditor
                          value={progressValue}
                          onChange={setProgressValue}
                          placeholder="Write today's progress..."
                          className="min-h-[120px]"
                        />
                      )}

                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAddingProgress(false);
                            setProgressValue('');
                            setShowProgressFormatChooser(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!progressValue.trim()}
                          onClick={() => {
                            void handleSubmitProgress();
                          }}
                        >
                          Save Progress
                        </Button>
                      </div>
                    </div>
                  )}

                  {loadingProgress ? (
                    <p className="text-xs text-muted-foreground">Loading progress...</p>
                  ) : progressItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No progress updates yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {progressItems.map((item) => (
                        <div key={item.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                            <span className="mt-1 h-full w-px bg-border" />
                          </div>
                          <div className="flex-1 rounded-md border p-3 space-y-1.5">
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(item.created_at)}
                            </p>
                            <RichTextEditor
                              value={item.content}
                              onChange={() => {}}
                              readOnly
                              className="min-h-0"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
