import { Outlet } from '@tanstack/react-router';
import { Sidebar } from '@/components/layout/Sidebar';
import { TaskDetailPanel } from '@/components/task/TaskDetailPanel';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useGlobalShortcuts } from '@/hooks/use-keyboard-shortcuts';

export function RootLayout() {
  useGlobalShortcuts();

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
      <ErrorBoundary>
        <TaskDetailPanel />
      </ErrorBoundary>
    </div>
  );
}
