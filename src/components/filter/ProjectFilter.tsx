import { useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { useUIStore } from '@/stores/ui-store';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface ProjectFilterProps {
  className?: string;
}

export function ProjectFilter({ className }: ProjectFilterProps) {
  const [open, setOpen] = useState(false);

  const projects = useProjectStore((s) => s.projects);
  const selectedProjectIds = useUIStore((s) => s.selectedProjectIds);
  const toggleProjectId = useUIStore((s) => s.toggleProjectId);
  const setSelectedProjectIds = useUIStore((s) => s.setSelectedProjectIds);

  const activeProjects = projects.filter((p) => p.status === 'active');
  const allSelected =
    activeProjects.length > 0 &&
    activeProjects.every((p) => selectedProjectIds.includes(p.id));
  const someSelected =
    !allSelected && selectedProjectIds.length > 0;

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedProjectIds([]);
    } else {
      setSelectedProjectIds(activeProjects.map((p) => p.id));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1',
            someSelected && 'border-primary',
            className,
          )}
        >
          Projects
          {someSelected && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {selectedProjectIds.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
          <Checkbox
            checked={allSelected}
            onCheckedChange={handleToggleAll}
          />
          <span className="text-sm font-medium">All</span>
        </label>
        <div className="my-1 h-px bg-border" />
        {activeProjects.map((project) => (
          <label
            key={project.id}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
          >
            <Checkbox
              checked={selectedProjectIds.includes(project.id)}
              onCheckedChange={() => toggleProjectId(project.id)}
            />
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate text-sm">{project.name}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
