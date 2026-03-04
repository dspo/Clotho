import { HEADER_HEIGHT, type HeaderCell } from './gantt-utils';

interface GanttTimelineHeaderProps {
  topRow: HeaderCell[];
  bottomRow: HeaderCell[];
  totalWidth: number;
}

export function GanttTimelineHeader({ topRow, bottomRow, totalWidth }: GanttTimelineHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 border-b bg-muted/50 backdrop-blur-sm"
      style={{ width: totalWidth, height: HEADER_HEIGHT }}
    >
      {/* Top row */}
      <div className="flex h-6 border-b" style={{ width: totalWidth }}>
        {topRow.map((cell, i) => (
          <div
            key={i}
            className="shrink-0 border-r px-2 text-xs font-semibold text-muted-foreground flex items-center"
            style={{ width: cell.width, marginLeft: i === 0 ? cell.x : 0 }}
          >
            {cell.label}
          </div>
        ))}
      </div>
      {/* Bottom row */}
      <div className="flex h-6" style={{ width: totalWidth }}>
        {bottomRow.map((cell, i) => (
          <div
            key={i}
            className="shrink-0 border-r px-1 text-xs text-muted-foreground flex items-center justify-center"
            style={{ width: cell.width }}
          >
            {cell.label}
          </div>
        ))}
      </div>
    </div>
  );
}
