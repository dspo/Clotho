import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/common/SearchInput';

export type ProjectStatusFilter = 'all' | 'active' | 'completed' | 'archived';
export type ProjectSortOption = 'default' | 'name' | 'created' | 'updated' | 'progress';

interface ProjectListToolbarProps {
  statusFilter: ProjectStatusFilter;
  onStatusFilterChange: (value: ProjectStatusFilter) => void;
  sortOption: ProjectSortOption;
  onSortChange: (value: ProjectSortOption) => void;
  onSearch: (query: string) => void;
  onCreateProject: () => void;
}

export function ProjectListToolbar({
  statusFilter,
  onStatusFilterChange,
  sortOption,
  onSortChange,
  onSearch,
  onCreateProject,
}: ProjectListToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Create button */}
      <Button size="sm" onClick={onCreateProject}>
        <Plus className="h-4 w-4" />
        New Project
      </Button>

      <div className="flex-1" />

      {/* Status filter */}
      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as ProjectStatusFilter)}>
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select value={sortOption} onValueChange={(v) => onSortChange(v as ProjectSortOption)}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default</SelectItem>
          <SelectItem value="name">By Name</SelectItem>
          <SelectItem value="created">By Created</SelectItem>
          <SelectItem value="updated">By Updated</SelectItem>
          <SelectItem value="progress">By Progress</SelectItem>
        </SelectContent>
      </Select>

      {/* Search */}
      <SearchInput
        onSearch={onSearch}
        placeholder="Search projects..."
        expandable
        className="w-[200px]"
      />
    </div>
  );
}
