import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FilterToolbar, type FilterState } from '@/components/filter/FilterToolbar';
import { ProjectFilter } from '@/components/filter/ProjectFilter';
import { Group, Plus } from 'lucide-react';
import type { Tag } from '@/types/tag';

export type GroupBy = 'none' | 'project' | 'status' | 'priority';

interface ListToolbarProps {
  filter: FilterState;
  onFilterChange: (filter: FilterState) => void;
  groupBy: GroupBy;
  onGroupByChange: (groupBy: GroupBy) => void;
  tags: Tag[];
  onCreateTask?: () => void;
  className?: string;
}

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'project', label: 'By project' },
  { value: 'status', label: 'By status' },
  { value: 'priority', label: 'By priority' },
];

export function ListToolbar({
  filter,
  onFilterChange,
  groupBy,
  onGroupByChange,
  tags,
  onCreateTask,
  className,
}: ListToolbarProps) {
  return (
    <div className={cn('flex h-10 items-center gap-2 px-3 border-b', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5">
            <Group className="h-4 w-4" />
            Group
            {groupBy !== 'none' && (
              <span className="ml-0.5 text-xs text-muted-foreground">
                ({GROUP_OPTIONS.find((o) => o.value === groupBy)?.label})
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {GROUP_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onGroupByChange(opt.value)}
              className={cn(groupBy === opt.value && 'bg-accent')}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-5 w-px bg-border" />

      <ProjectFilter />

      <FilterToolbar
        filter={filter}
        onChange={onFilterChange}
        tags={tags}
      />

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
