import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FilterToolbar, type FilterState } from '@/components/filter/FilterToolbar';
import { ProjectFilter } from '@/components/filter/ProjectFilter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { Tag } from '@/types/tag';

export type BoardGroupBy = 'status' | 'priority';

interface BoardToolbarProps {
  groupBy: BoardGroupBy;
  onGroupByChange: (groupBy: BoardGroupBy) => void;
  filter: FilterState;
  onFilterChange: (filter: FilterState) => void;
  tags: Tag[];
  onCreateTask?: () => void;
  className?: string;
}

export function BoardToolbar({
  groupBy,
  onGroupByChange,
  filter,
  onFilterChange,
  tags,
  onCreateTask,
  className,
}: BoardToolbarProps) {
  return (
    <div className={cn('flex h-10 items-center gap-3 border-b px-4', className)}>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Group:</span>
        <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as BoardGroupBy)}>
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="h-5 w-px bg-border" />
      <ProjectFilter />
      <FilterToolbar filter={filter} onChange={onFilterChange} tags={tags} />
      <div className="flex-1" />
      {onCreateTask && (
        <Button variant="default" size="sm" className="h-8 gap-1.5" onClick={onCreateTask}>
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      )}
    </div>
  );
}
