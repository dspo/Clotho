import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type { Tag } from '@/types/tag';

interface TagFilterProps {
  tags: Tag[];
  selected: string[];
  onChange: (tagIds: string[]) => void;
  className?: string;
}

export function TagFilter({ tags, selected, onChange, className }: TagFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(
    (id: string) => {
      if (selected.includes(id)) {
        onChange(selected.filter((t) => t !== id));
      } else {
        onChange([...selected, id]);
      }
    },
    [selected, onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 gap-1', selected.length > 0 && 'border-primary', className)}
        >
          Tags
          {selected.length > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        {tags.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No tags</p>
        ) : (
          tags.map((tag) => (
            <label
              key={tag.id}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(tag.id)}
                onCheckedChange={() => toggle(tag.id)}
              />
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-sm truncate">{tag.name}</span>
            </label>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
