import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/common/SearchInput';
import { StatusFilter } from './StatusFilter';
import { PriorityFilter } from './PriorityFilter';
import { TagFilter } from './TagFilter';
import { DateFilter, type DatePreset } from './DateFilter';
import { Button } from '@/components/ui/button';
import { CalendarOff, X } from 'lucide-react';
import type { TaskStatus, TaskPriority } from '@/types/task';
import type { Tag } from '@/types/tag';

export interface FilterState {
  search: string;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  tagIds: string[];
  datePreset: DatePreset | null;
  unscheduled: boolean;
}

export const EMPTY_FILTER: FilterState = {
  search: '',
  statuses: [],
  priorities: [],
  tagIds: [],
  datePreset: null,
  unscheduled: false,
};

interface FilterToolbarProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  tags: Tag[];
  className?: string;
}

export function FilterToolbar({ filter, onChange, tags, className }: FilterToolbarProps) {
  const hasActiveFilters =
    filter.statuses.length > 0 ||
    filter.priorities.length > 0 ||
    filter.tagIds.length > 0 ||
    filter.datePreset !== null ||
    filter.unscheduled;

  // Use a ref to avoid re-creating handleSearch when filter changes,
  // which would cause SearchInput's useEffect to re-fire and trigger an infinite loop.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleSearch = useCallback(
    (search: string) => onChangeRef.current({ ...filterRef.current, search }),
    [],
  );

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <SearchInput
        onSearch={handleSearch}
        placeholder="Search tasks..."
        expandable
      />
      <StatusFilter
        selected={filter.statuses}
        onChange={(statuses) => onChange({ ...filter, statuses })}
      />
      <PriorityFilter
        selected={filter.priorities}
        onChange={(priorities) => onChange({ ...filter, priorities })}
      />
      <TagFilter
        tags={tags}
        selected={filter.tagIds}
        onChange={(tagIds) => onChange({ ...filter, tagIds })}
      />
      <DateFilter
        value={filter.datePreset}
        onChange={(datePreset) => onChange({ ...filter, datePreset })}
      />
      {filter.unscheduled && (
        <button
          type="button"
          onClick={() => onChange({ ...filter, unscheduled: false })}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-primary bg-primary/10 text-xs text-primary hover:bg-primary/20 transition-colors"
        >
          <CalendarOff className="h-3 w-3" />
          Unscheduled
          <X className="h-3 w-3" />
        </button>
      )}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-muted-foreground"
          onClick={() => onChange({ ...EMPTY_FILTER, search: filter.search })}
        >
          <X className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
