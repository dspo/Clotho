import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/ui-store';

interface Shortcut {
  key: string;
  meta?: boolean;
  shift?: boolean;
  handler: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Allow system shortcuts (Cmd+C, Cmd+V, Cmd+A, Cmd+X, Cmd+Z, etc.) to pass through
      if ((e.metaKey || e.ctrlKey) && ['c', 'v', 'a', 'x', 'z', 'y'].includes(e.key.toLowerCase())) {
        return;
      }

      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.meta ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        if (e.key === shortcut.key && metaMatch && shiftMatch) {
          e.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function useGlobalShortcuts() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useKeyboardShortcuts([
    {
      key: '\\',
      meta: true,
      handler: toggleSidebar,
    },
  ]);
}
