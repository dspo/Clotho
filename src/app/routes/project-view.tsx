import { useParams } from '@tanstack/react-router';
import { ViewTabs } from '@/components/layout/ViewTabs';
import { useProjectStore } from '@/stores/project-store';
import { useEffect } from 'react';
import { BoardView } from '@/components/views/board/BoardView';
import { CalendarView } from '@/components/views/calendar/CalendarView';
import { GanttView } from '@/components/views/gantt';
import { ListView } from '@/components/views/list/ListView';

export function ProjectViewPage() {
  const { projectId, view } = useParams({ strict: false }) as {
    projectId: string;
    view: string;
  };
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  useEffect(() => {
    setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  const renderView = () => {
    switch (view) {
      case 'list':
        return <ListView />;
      case 'board':
        return <BoardView />;
      case 'calendar':
        return <CalendarView />;
      case 'gantt':
        return <GanttView />;
      default:
        return (
          <div className="flex-1 overflow-auto p-6">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-lg text-muted-foreground capitalize">{view} View</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This view will be implemented soon
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ViewTabs />
      {renderView()}
    </div>
  );
}
