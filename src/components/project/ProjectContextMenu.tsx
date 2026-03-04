import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Pencil, Archive, ArchiveRestore, Trash2, FolderOpen } from 'lucide-react';

interface ProjectContextMenuProps {
  children: React.ReactNode;
  isArchived?: boolean;
  onOpen?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
}

export function ProjectContextMenu({
  children,
  isArchived = false,
  onOpen,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
}: ProjectContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {onOpen && (
          <ContextMenuItem onClick={onOpen}>
            <FolderOpen className="h-4 w-4" />
            Open project
          </ContextMenuItem>
        )}

        {onRename && (
          <ContextMenuItem onClick={onRename}>
            <Pencil className="h-4 w-4" />
            Rename
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {!isArchived && onArchive && (
          <ContextMenuItem onClick={onArchive}>
            <Archive className="h-4 w-4" />
            Archive
          </ContextMenuItem>
        )}

        {isArchived && onUnarchive && (
          <ContextMenuItem onClick={onUnarchive}>
            <ArchiveRestore className="h-4 w-4" />
            Unarchive
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
