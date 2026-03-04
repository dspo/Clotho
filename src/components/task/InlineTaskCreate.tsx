import { useState, useRef, useEffect } from 'react';
import { Plus, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TaskStatus, TaskPriority } from '@/types/task';

interface InlineTaskCreateProps {
  onSubmit: (title: string) => void;
  onExpandClick?: () => void;
  defaultStatus?: TaskStatus;
  defaultPriority?: TaskPriority;
  placeholder?: string;
  className?: string;
}

export function InlineTaskCreate({
  onSubmit,
  onExpandClick,
  placeholder = 'Add a task...',
  className,
}: InlineTaskCreateProps) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && inputRef.current) {
      inputRef.current.focus();
    }
  }, [active]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
    }
  };

  const handleBlur = () => {
    if (!value.trim()) {
      setActive(false);
    }
  };

  if (!active) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <button
          type="button"
          onClick={() => setActive(true)}
          className="flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {placeholder}
        </button>
        {onExpandClick && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground shrink-0"
                onClick={onExpandClick}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Create with details</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 px-1', className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') {
            setValue('');
            setActive(false);
          }
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
      {onExpandClick && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setValue('');
                setActive(false);
                onExpandClick();
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Create with details</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
