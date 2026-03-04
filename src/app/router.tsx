import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
} from '@tanstack/react-router';
import { RootLayout } from './routes/__root';
import { ProjectListPage } from './routes/projects-index';
import { BoardPage } from './routes/board';
import { ListPage } from './routes/list';
import { GanttPage } from './routes/gantt';
import { CalendarPage } from './routes/calendar';

// Root route
const rootRoute = createRootRoute({
  component: RootLayout,
});

const VIEW_PATH_MAP: Record<string, string> = {
  board: '/board',
  list: '/list',
  gantt: '/gantt',
  calendar: '/calendar',
};

function getDefaultViewPath(): string {
  try {
    const stored = localStorage.getItem('clotho-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      const viewOrder: string[] | undefined = parsed?.state?.viewOrder;
      if (viewOrder && viewOrder.length > 0 && VIEW_PATH_MAP[viewOrder[0]]) {
        return VIEW_PATH_MAP[viewOrder[0]];
      }
    }
  } catch {
    // ignore parse errors
  }
  return '/gantt';
}

// Index route - redirect to first view in viewOrder
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: getDefaultViewPath() });
  },
});

// View routes
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/board',
  component: BoardPage,
});

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/list',
  component: ListPage,
});

const ganttRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gantt',
  component: GanttPage,
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: CalendarPage,
});

// Projects list
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectListPage,
});

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  boardRoute,
  listRoute,
  ganttRoute,
  calendarRoute,
  projectsRoute,
]);

export const router = createRouter({ routeTree });

// Type registration
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
