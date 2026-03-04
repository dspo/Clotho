import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/constants';
import { Eye, Pencil, Copy, Trash2, Tag } from 'lucide-react';
import type { TaskStatus, TaskPriority } from '@/types/task';

interface TaskContextMenuProps {
  children: React.ReactNode;
  onOpen?: () => void;
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: TaskPriority) => void;
  onAddTag?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function TaskContextMenu({
  children,
  onOpen,
  onStatusChange,
  onPriorityChange,
  onAddTag,
  onDuplicate,
  onDelete,
}: TaskContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {onOpen && (
          <ContextMenuItem onClick={onOpen}>
            <Eye className="h-4 w-4" />
            Open detail
          </ContextMenuItem>
        )}

        {onStatusChange && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Pencil className="h-4 w-4" />
              Set status
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {TASK_STATUSES.map((s) => (
                <ContextMenuItem key={s.value} onClick={() => onStatusChange(s.value)}>
                  <StatusBadge status={s.value} />
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {onPriorityChange && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Pencil className="h-4 w-4" />
              Set priority
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {TASK_PRIORITIES.map((p) => (
                <ContextMenuItem key={p.value} onClick={() => onPriorityChange(p.value)}>
                  <PriorityBadge priority={p.value} />
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {onAddTag && (
          <ContextMenuItem onClick={onAddTag}>
            <Tag className="h-4 w-4" />
            Add tag
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {onDuplicate && (
          <ContextMenuItem onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
            Duplicate
          </ContextMenuItem>
        )}

        {onDelete && (
          <ContextMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
