import { Outlet, useMatches } from '@tanstack/react-router';
import { Sidebar } from '@/components/layout/Sidebar';
import { TaskDetailPanel } from '@/components/task/TaskDetailPanel';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useGlobalShortcuts } from '@/hooks/use-keyboard-shortcuts';

export function RootLayout() {
  useGlobalShortcuts();
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.pathname ?? '/';
  const showTaskDetailPanel = !currentPath.startsWith('/assistant');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <div className="flex flex-1 flex-col overflow-hidden">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </div>
      {showTaskDetailPanel && (
        <ErrorBoundary>
          <TaskDetailPanel />
        </ErrorBoundary>
      )}
    </div>
  );
}
