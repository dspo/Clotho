import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { TaskWithTags } from '@/types/task';

interface TitleCellProps {
  task: TaskWithTags;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  childCount: number;
  isEditing: boolean;
  onToggleExpand: () => void;
  onSave: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onTabNext: () => void;
}

export function TitleCell({
  task,
  depth,
  hasChildren,
  expanded,
  childCount,
  isEditing,
  onToggleExpand,
  onSave,
  onStartEdit: _onStartEdit,
  onCancelEdit,
  onTabNext,
}: TitleCellProps) {
  const [value, setValue] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setValue(task.title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing, task.title]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && trimmed !== task.title) {
        onSave(trimmed);
      } else {
        onCancelEdit();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && trimmed !== task.title) {
        onSave(trimmed);
      }
      onTabNext();
    }
  };

  const isDone = task.status === 'done' || task.status === 'cancelled';

  if (isEditing) {
    return (
      <div
        className="flex items-center h-full"
        style={{ paddingLeft: depth * 24 }}
      >
        <div className="w-6 shrink-0" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            const trimmed = value.trim();
            if (trimmed && trimmed !== task.title) {
              onSave(trimmed);
            } else {
              onCancelEdit();
            }
          }}
          className="h-7 text-sm border-accent ring-accent"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center h-full min-w-0"
      style={{ paddingLeft: depth * 24 }}
    >
      <button
        type="button"
        className={cn(
          'flex items-center justify-center w-6 h-6 shrink-0 rounded hover:bg-muted/80 transition-colors',
          !hasChildren && 'invisible',
        )}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        {hasChildren &&
          (expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ))}
      </button>
      <span
        className={cn(
          'truncate text-sm',
          isDone && 'line-through text-muted-foreground',
        )}
      >
        {task.title}
      </span>
      {!expanded && hasChildren && childCount > 0 && (
        <span className="ml-1.5 text-xs text-muted-foreground shrink-0">
          ({childCount})
        </span>
      )}
    </div>
  );
}
