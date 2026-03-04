import { useMatches } from '@tanstack/react-router';
import {
  Columns3,
  List,
  GanttChart,
  Calendar,
  FolderKanban,
} from 'lucide-react';

const VIEW_MAP: Record<string, { label: string; icon: React.ElementType }> = {
  '/board': { label: 'Board', icon: Columns3 },
  '/list': { label: 'List', icon: List },
  '/gantt': { label: 'Gantt', icon: GanttChart },
  '/calendar': { label: 'Calendar', icon: Calendar },
  '/projects': { label: 'Projects', icon: FolderKanban },
};

export function ViewTabs() {
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.pathname ?? '/';
  const current = VIEW_MAP[currentPath];

  if (!current) return null;

  const Icon = current.icon;

  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{current.label}</span>
    </div>
  );
}
