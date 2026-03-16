import { useEffect, useState } from 'react';
import { Type, Code, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { TaskForm } from '@/components/task/TaskForm';
import type { TaskFormValue } from '@/components/task/TaskForm';
import { useTagStore } from '@/stores/tag-store';
import type { CreateTaskInput, TaskStatus, TaskPriority, DescriptionFormat } from '@/types/task';
import type { Tag } from '@/types/tag';
import { VisuallyHidden } from 'radix-ui';

interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateTaskInput) => void;
  projectId: string;
  allTags: Tag[];
  defaultStatus?: TaskStatus;
  defaultPriority?: TaskPriority;
}

export function TaskCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  projectId,
  allTags,
  defaultStatus = 'todo',
  defaultPriority = 'low',
}: TaskCreateDialogProps) {
  const createTag = useTagStore((s) => s.createTag);
  const fetchTags = useTagStore((s) => s.fetchTags);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionFormat, setDescriptionFormat] = useState<DescriptionFormat | null>(null);
  const [showFormatChooser, setShowFormatChooser] = useState(false);
  const [formValue, setFormValue] = useState<TaskFormValue>({
    status: defaultStatus,
    priority: defaultPriority,
    difficulty: null,
    startDate: null,
    dueDate: null,
    tagIds: [],
    estimatedHours: null,
    actualHours: null,
  });

  useEffect(() => {
    if (!open || allTags.length > 0) return;
    void fetchTags();
  }, [open, allTags.length, fetchTags]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDescriptionFormat(null);
    setShowFormatChooser(false);
    setFormValue({
      status: defaultStatus,
      priority: defaultPriority,
      difficulty: null,
      startDate: null,
      dueDate: null,
      tagIds: [],
      estimatedHours: null,
      actualHours: null,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    const input: CreateTaskInput = {
      project_id: projectId,
      title: trimmed,
      description: description.trim() || undefined,
      description_format: descriptionFormat ?? undefined,
      status: formValue.status,
      priority: formValue.priority,
      difficulty: formValue.difficulty ?? undefined,
      start_date: formValue.startDate ?? undefined,
      due_date: formValue.dueDate ?? undefined,
      estimated_hours: formValue.estimatedHours ?? undefined,
      tag_ids: formValue.tagIds.length > 0 ? formValue.tagIds : undefined,
    };

    onSubmit(input);
    resetForm();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleDescriptionClick = () => {
    if (descriptionFormat === null) {
      setShowFormatChooser(true);
    }
  };

  const handleFormatSelect = (fmt: DescriptionFormat) => {
    setDescriptionFormat(fmt);
    setShowFormatChooser(false);
  };

  const handleCreateTag = async (name: string, color: string): Promise<Tag> => {
    try {
      return await createTag({ name, color });
    } catch (error) {
      const message = String(error).toLowerCase();
      if (message.includes('already exists') || message.includes('conflict')) {
        await fetchTags();
        const existing = useTagStore
          .getState()
          .tags
          .find((tag) => tag.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing;
      }
      toast.error('Failed to create tag');
      throw error;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          <DialogTitle>New task</DialogTitle>
        </VisuallyHidden.Root>

        <form onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
              className="text-lg font-semibold flex-1 border-0 shadow-none focus-visible:ring-0 px-1 -mx-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 ml-2 shrink-0"
              onClick={() => handleOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Metadata row */}
          <div className="border-b px-6 py-3 shrink-0">
            <TaskForm
              value={formValue}
              onChange={(update) => setFormValue((prev) => ({ ...prev, ...update }))}
              allTags={allTags}
              onCreateTag={handleCreateTag}
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
                    {descriptionFormat && (
                      <span className="ml-1.5 text-[10px] opacity-60 uppercase">{descriptionFormat}</span>
                    )}
                  </label>
                  {descriptionFormat && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
                      onClick={() => {
                        setDescriptionFormat(null);
                        setDescription('');
                        setShowFormatChooser(false);
                      }}
                    >
                      Change format
                    </button>
                  )}
                </div>

                {showFormatChooser ? (
                  <div className="flex gap-2 p-4 border rounded-md bg-muted/30">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-auto flex-col gap-1.5 py-4"
                      onClick={() => handleFormatSelect('richtext')}
                    >
                      <Type className="h-5 w-5" />
                      <span className="text-sm font-medium">Rich Text</span>
                      <span className="text-xs text-muted-foreground">WYSIWYG editor</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-auto flex-col gap-1.5 py-4"
                      onClick={() => handleFormatSelect('markdown')}
                    >
                      <Code className="h-5 w-5" />
                      <span className="text-sm font-medium">Markdown</span>
                      <span className="text-xs text-muted-foreground">Plain text with syntax</span>
                    </Button>
                  </div>
                ) : descriptionFormat === 'markdown' ? (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Write markdown here..."
                    className="w-full min-h-[160px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                ) : descriptionFormat === 'richtext' ? (
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    placeholder="Add a description..."
                    className="min-h-[160px]"
                  />
                ) : (
                  <div
                    className="cursor-pointer rounded-md border border-input px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 min-h-[80px] flex items-start"
                    onClick={handleDescriptionClick}
                  >
                    <span>Add a description...</span>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t px-6 py-3 shrink-0 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
