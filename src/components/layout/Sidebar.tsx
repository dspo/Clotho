import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/project-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useNavigate, useMatches } from '@tanstack/react-router';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Settings,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  PanelLeft,
  LayoutGrid,
  List,
  GanttChart,
  Calendar,
  FolderKanban,
  GripVertical,
  Plug,
  Unplug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ClothoLogo } from '@/components/common/ClothoLogo';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/lib/constants';
import { useEffect, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { SettingsDialog } from '@/components/layout/SettingsDialog';

interface McpServerStatus {
  enabled: boolean;
  url: string;
  bindAddr: string;
  hasServerTask: boolean;
  running: boolean;
  state: 'disabled' | 'running' | 'starting' | 'stopped' | string;
  message?: string | null;
}

const VIEW_NAV_MAP: Record<string, { path: string; label: string; icon: LucideIcon }> = {
  board: { path: '/board', label: 'Board', icon: LayoutGrid },
  list: { path: '/list', label: 'List', icon: List },
  gantt: { path: '/gantt', label: 'Gantt', icon: GanttChart },
  calendar: { path: '/calendar', label: 'Calendar', icon: Calendar },
};

interface SortableViewItemProps {
  id: string;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function SortableViewItem({ id, isActive, collapsed, onClick }: SortableViewItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const view = VIEW_NAV_MAP[id];
  if (!view) return null;
  const Icon = view.icon;

  return (
    <div ref={setNodeRef} style={style}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isActive ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-2',
              collapsed && 'justify-center px-0',
            )}
            onClick={onClick}
          >
            {!collapsed && (
              <span
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            <Icon className="h-4 w-4" />
            {!collapsed && <span className="text-sm">{view.label}</span>}
          </Button>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right">{view.label}</TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const selectedProjectIds = useUIStore((s) => s.selectedProjectIds);
  const setSelectedProjectIds = useUIStore((s) => s.setSelectedProjectIds);

  const projects = useProjectStore((s) => s.projects);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const viewOrder = useSettingsStore((s) => s.viewOrder);
  const setViewOrder = useSettingsStore((s) => s.setViewOrder);
  const navigate = useNavigate();
  const matches = useMatches();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null);

  const fetchMcpStatus = useCallback(async () => {
    try {
      const status = await invoke<McpServerStatus>('get_mcp_server_status');
      setMcpStatus(status);
    } catch (e) {
      console.error('Failed to fetch MCP status:', e);
      setMcpStatus(null);
    }
  }, []);

  const currentPath = matches[matches.length - 1]?.pathname ?? '/';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const unlisten = listen('open-settings', () => {
      setSettingsOpen(true);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // Fetch MCP status on mount and periodically
  useEffect(() => {
    fetchMcpStatus();
    const interval = setInterval(fetchMcpStatus, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [fetchMcpStatus]);

  // Refresh MCP status when settings dialog closes
  useEffect(() => {
    if (!settingsOpen) {
      fetchMcpStatus();
    }
  }, [settingsOpen, fetchMcpStatus]);

  // Initialize selectedProjectIds to all active projects when projects load
  const activeProjects = projects.filter((p) => p.status === 'active');
  useEffect(() => {
    if (activeProjects.length > 0 && selectedProjectIds.length === 0) {
      setSelectedProjectIds(activeProjects.map((p) => p.id));
    }
  }, [activeProjects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  const themeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const ThemeIcon = themeIcon;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = viewOrder.indexOf(active.id as string);
      const newIndex = viewOrder.indexOf(over.id as string);
      const newOrder = arrayMove(viewOrder, oldIndex, newIndex);
      setViewOrder(newOrder);
    }
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200',
      )}
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <ClothoLogo size={22} />
            <span className="text-sm font-semibold tracking-tight">Clotho</span>
          </div>
        )}
        {collapsed && (
          <ClothoLogo size={22} />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSidebar}>
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator />

      {/* View navigation */}
      <div className="px-2 py-2 space-y-0.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={viewOrder} strategy={verticalListSortingStrategy}>
            {viewOrder.map((viewId) => {
              const view = VIEW_NAV_MAP[viewId];
              if (!view) return null;
              const isActive = currentPath === view.path;
              return (
                <SortableViewItem
                  key={viewId}
                  id={viewId}
                  isActive={isActive}
                  collapsed={collapsed}
                  onClick={() => navigate({ to: view.path })}
                />
              );
            })}
          </SortableContext>
        </DndContext>

        <Separator className="my-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={currentPath === '/projects' ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-2',
                collapsed && 'justify-center px-0',
              )}
              onClick={() => navigate({ to: '/projects' })}
            >
              <FolderKanban className="h-4 w-4" />
              {!collapsed && <span className="text-sm">Projects</span>}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Projects</TooltipContent>
          )}
        </Tooltip>
      </div>

      <div className="flex-1" />

      <Separator />

      {/* Bottom actions */}
      <div className="flex items-center gap-1 p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cycleTheme}>
              <ThemeIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Theme: {theme}</TooltipContent>
        </Tooltip>

        {/* MCP Status Indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSettingsOpen(true)}
            >
              {mcpStatus?.state === 'running' ? (
                <Plug className="h-4 w-4 text-emerald-500 animate-breathe" />
              ) : (
                <Unplug className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            MCP: {mcpStatus?.state === 'running' ? 'Plugging' : mcpStatus?.state === 'disabled' ? 'Disabled' : 'Unplug'}
          </TooltipContent>
        </Tooltip>

        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        )}
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}
