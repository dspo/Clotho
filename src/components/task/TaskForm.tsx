import { useState } from 'react';
import { Calendar as CalendarIcon, Clock, Plus, X, Circle, CircleDot, CircleDashed } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { TagChip } from '@/components/common/TagChip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_DIFFICULTIES, PROJECT_COLORS } from '@/lib/constants';
import type { TaskStatus, TaskPriority, TaskDifficulty } from '@/types/task';
import type { Tag } from '@/types/tag';

const DifficultyIcons = {
  simple: Circle,
  medium: CircleDot,
  complex: CircleDashed,
} as const;

export interface TaskFormValue {
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty | null;
  startDate: string | null;
  dueDate: string | null;
  tagIds: string[];
  estimatedHours: number | null;
  actualHours: number | null;
}

interface TaskFormProps {
  value: TaskFormValue;
  onChange: (update: Partial<TaskFormValue>) => void;
  allTags: Tag[];
  onCreateTag?: (name: string, color: string) => Promise<Tag>;
  showActualHours?: boolean;
}

export function TaskForm({ value, onChange, allTags, onCreateTag, showActualHours = false }: TaskFormProps) {
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  const filteredTags = tagSearch
    ? allTags.filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
    : allTags;
  const selectedTags = allTags.filter((t) => value.tagIds.includes(t.id));

  const addTagId = (tagId: string) => {
    if (value.tagIds.includes(tagId)) return;
    onChange({ tagIds: [...value.tagIds, tagId] });
  };

  const removeTagId = (tagId: string) => {
    onChange({ tagIds: value.tagIds.filter((id) => id !== tagId) });
  };

  const handleCreateTag = async () => {
    if (!onCreateTag || creatingTag) return;
    const name = newTagName.trim();
    if (!name) return;

    const existing = allTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      addTagId(existing.id);
      setNewTagName('');
      return;
    }

    setCreatingTag(true);
    try {
      const color = PROJECT_COLORS[allTags.length % PROJECT_COLORS.length];
      const created = await onCreateTag(name, color);
      addTagId(created.id);
      setNewTagName('');
      setTagSearch('');
    } finally {
      setCreatingTag(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Status + Priority + Difficulty */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={value.status} onValueChange={(v) => onChange({ status: v as TaskStatus })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  <StatusBadge status={s.value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Priority</label>
          <Select value={value.priority} onValueChange={(v) => onChange({ priority: v as TaskPriority })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <PriorityBadge priority={p.value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
          <Select
            value={value.difficulty ?? 'none'}
            onValueChange={(v) => onChange({ difficulty: v === 'none' ? null : (v as TaskDifficulty) })}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Not set</span>
              </SelectItem>
              {TASK_DIFFICULTIES.map((d) => {
                const Icon = DifficultyIcons[d.value];
                return (
                  <SelectItem key={d.value} value={d.value}>
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" style={{ color: d.color }} />
                      <span>{d.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dates */}
      <div className="flex gap-4">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Start date</label>
          <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-8 w-full items-center gap-1.5 rounded-md border border-input px-2 text-sm hover:bg-accent hover:text-accent-foreground',
                  !value.startDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                {value.startDate ? (
                  <>
                    <span className="flex-1 text-left">{format(parseISO(value.startDate), 'MMM d, yyyy')}</span>
                    <X
                      className="h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange({ startDate: null });
                        setStartDateOpen(false);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-left">Not set</span>
                    <Plus className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.startDate ? parseISO(value.startDate) : undefined}
                onSelect={(date) => {
                  onChange({ startDate: date ? format(date, 'yyyy-MM-dd') : null });
                  setStartDateOpen(false);
                }}
                defaultMonth={value.startDate ? parseISO(value.startDate) : undefined}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Due date</label>
          <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-8 w-full items-center gap-1.5 rounded-md border border-input px-2 text-sm hover:bg-accent hover:text-accent-foreground',
                  !value.dueDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                {value.dueDate ? (
                  <>
                    <span className="flex-1 text-left">{format(parseISO(value.dueDate), 'MMM d, yyyy')}</span>
                    <X
                      className="h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange({ dueDate: null });
                        setDueDateOpen(false);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-left">Not set</span>
                    <Plus className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.dueDate ? parseISO(value.dueDate) : undefined}
                onSelect={(date) => {
                  onChange({ dueDate: date ? format(date, 'yyyy-MM-dd') : null });
                  setDueDateOpen(false);
                }}
                defaultMonth={value.dueDate ? parseISO(value.dueDate) : undefined}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Hours */}
      <div className="flex gap-4">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Estimated hours</label>
          <div className="relative">
            <Clock className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="number"
              min="0"
              step="0.5"
              placeholder="0"
              className="h-8 pl-7 text-sm"
              value={value.estimatedHours ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                onChange({ estimatedHours: val === '' ? null : parseFloat(val) });
              }}
            />
          </div>
        </div>

        {showActualHours && (
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Actual hours</label>
            <div className="relative">
              <Clock className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                className="h-8 pl-7 text-sm"
                value={value.actualHours ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onChange({ actualHours: val === '' ? null : parseFloat(val) });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Tags</label>
        <div className="rounded-md border p-3 space-y-2">
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedTags.map((tag) => (
                <TagChip key={tag.id} tag={tag} onRemove={() => removeTagId(tag.id)} />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Create tag..."
              className="h-7 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateTag();
                }
              }}
              disabled={!onCreateTag || creatingTag}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 shrink-0"
              onClick={() => {
                void handleCreateTag();
              }}
              disabled={!onCreateTag || creatingTag || !newTagName.trim()}
            >
              Add
            </Button>
          </div>
          <Input
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="Search tags..."
            className="h-7 text-sm"
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filteredTags.map((tag) => {
              const checked = value.tagIds.includes(tag.id);
              return (
                <label
                  key={tag.id}
                  className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(checkedValue) => {
                      if (checkedValue) {
                        addTagId(tag.id);
                        return;
                      }
                      removeTagId(tag.id);
                    }}
                  />
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate">{tag.name}</span>
                </label>
              );
            })}
            {filteredTags.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {allTags.length === 0 ? 'No tags yet. Create your first tag above.' : 'No tags found'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
