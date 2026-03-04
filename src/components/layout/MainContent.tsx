import { ViewTabs } from './ViewTabs';

interface MainContentProps {
  children: React.ReactNode;
  showViewTabs?: boolean;
}

export function MainContent({ children, showViewTabs = false }: MainContentProps) {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {showViewTabs && <ViewTabs />}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </main>
  );
}
