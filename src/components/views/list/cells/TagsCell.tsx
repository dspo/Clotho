import { useState, useMemo } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { TagChip } from '@/components/common/TagChip';
import type { Tag } from '@/types/tag';

interface TagsCellProps {
  taskTags: Tag[];
  allTags: Tag[];
  isEditing: boolean;
  onSave: (tagIds: string[]) => void;
  onStartEdit: () => void;
}

export function TagsCell({
  taskTags,
  allTags,
  isEditing,
  onSave,
  onStartEdit: _onStartEdit,
}: TagsCellProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const filteredTags = useMemo(() => {
    if (!search) return allTags;
    const lower = search.toLowerCase();
    return allTags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [allTags, search]);

  const handleOpen = () => {
    setSelected(taskTags.map((t) => t.id));
    setSearch('');
  };

  if (!isEditing) {
    return (
      <div
        className="flex items-center gap-1 h-full overflow-hidden"
      >
        {taskTags.slice(0, 2).map((tag) => (
          <TagChip key={tag.id} tag={tag} />
        ))}
        {taskTags.length > 2 && (
          <span className="text-xs text-muted-foreground shrink-0">
            +{taskTags.length - 2}
          </span>
        )}
      </div>
    );
  }

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) {
          onSave(selected);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 h-full w-full overflow-hidden"
          onClick={handleOpen}
        >
          {taskTags.slice(0, 2).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
          {taskTags.length > 2 && (
            <span className="text-xs text-muted-foreground shrink-0">
              +{taskTags.length - 2}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start" onOpenAutoFocus={handleOpen}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="h-7 text-sm mb-2"
        />
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {filteredTags.map((tag) => {
            const checked = selected.includes(tag.id);
            return (
              <label
                key={tag.id}
                className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    setSelected((prev) =>
                      c ? [...prev, tag.id] : prev.filter((id) => id !== tag.id),
                    );
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
              No tags found
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
