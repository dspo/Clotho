import { ChevronRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BoardColumnHeaderProps {
  name: string;
  color: string;
  count: number;
  totalCount?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function BoardColumnHeader({
  name,
  color,
  count,
  totalCount,
  collapsed,
  onToggleCollapse,
}: BoardColumnHeaderProps) {
  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center gap-2 py-3 px-1 cursor-pointer"
        onDoubleClick={onToggleCollapse}
      >
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span
          className="text-[13px] font-semibold text-foreground"
          style={{ writingMode: 'vertical-lr' }}
        >
          {name}
        </span>
        <span className="text-xs text-muted-foreground">{count}</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="mt-auto rounded p-0.5 hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 h-10">
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-sm font-semibold text-foreground truncate">
        {name}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded-full',
            'bg-muted text-muted-foreground',
          )}
        >
          {totalCount !== undefined && totalCount !== count
            ? `${count}/${totalCount}`
            : count}
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-0.5 hover:bg-muted transition-colors opacity-0 group-hover/col:opacity-100"
        >
          <Minus className="h-4 w-4 text-muted-foreground" />
        </button>
      </span>
    </div>
  );
}
