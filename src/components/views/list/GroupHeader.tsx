import { ChevronDown, ChevronRight } from 'lucide-react';

interface GroupHeaderProps {
  label: string;
  color?: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

export function GroupHeader({ label, color, count, expanded, onToggle }: GroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 h-9 bg-muted/30 border-b text-sm font-semibold hover:bg-muted/50 transition-colors"
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      {color && (
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {count} {count === 1 ? 'task' : 'tasks'}
      </span>
    </button>
  );
}
