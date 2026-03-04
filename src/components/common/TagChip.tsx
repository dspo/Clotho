import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types/tag';

interface TagChipProps {
  tag: Tag;
  onRemove?: () => void;
  className?: string;
}

export function TagChip({ tag, onRemove, className }: TagChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: tag.color }}
      />
      <span className="truncate max-w-[100px]">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors"
        >
          <X className="h-2.5 w-2.5 text-muted-foreground" />
        </button>
      )}
    </span>
  );
}
