import { useEffect, useRef, useState, useCallback } from 'react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Minus,
  Link2,
  ImageIcon,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SLASH_COMMANDS = [
  { id: 'paragraph', label: 'Text', icon: Type, description: 'Plain paragraph' },
  { id: 'heading1', label: 'Heading 1', icon: Heading1, description: 'Large heading' },
  { id: 'heading2', label: 'Heading 2', icon: Heading2, description: 'Medium heading' },
  { id: 'heading3', label: 'Heading 3', icon: Heading3, description: 'Small heading' },
  { id: 'bulletList', label: 'Bullet List', icon: List, description: 'Unordered list' },
  { id: 'orderedList', label: 'Ordered List', icon: ListOrdered, description: 'Numbered list' },
  { id: 'blockquote', label: 'Quote', icon: Quote, description: 'Block quote' },
  { id: 'codeBlock', label: 'Code Block', icon: Code2, description: 'Code snippet' },
  { id: 'horizontalRule', label: 'Divider', icon: Minus, description: 'Horizontal line' },
  { id: 'link', label: 'Link', icon: Link2, description: 'Insert hyperlink' },
  { id: 'image', label: 'Image', icon: ImageIcon, description: 'Insert image by URL' },
];

interface SlashMenuCallbackProps {
  query: string;
  clientRect: DOMRect | null;
}

interface SlashMenuConfig {
  onOpen: (props: SlashMenuCallbackProps) => void;
  onClose: () => void;
  onUpdate: (props: { query: string }) => void;
}

const slashMenuPluginKey = new PluginKey('slashMenu');

export const SlashMenuExtension = Extension.create<SlashMenuConfig>({
  name: 'slashMenu',

  addOptions() {
    return {
      onOpen: () => {},
      onClose: () => {},
      onUpdate: () => {},
    };
  },

  addProseMirrorPlugins() {
    const { onOpen, onClose, onUpdate } = this.options;
    let active = false;
    let slashPos: number | null = null;

    return [
      new Plugin({
        key: slashMenuPluginKey,
        view() {
          return {
            update(view) {
              const { state } = view;
              const { selection } = state;
              const { $from } = selection;

              // Only operate in empty text selections
              if (!selection.empty) {
                if (active) {
                  active = false;
                  slashPos = null;
                  onClose();
                }
                return;
              }

              const textBefore = $from.parent.textBetween(
                0,
                $from.parentOffset,
                '\0',
              );

              const slashMatch = textBefore.match(/\/([a-zA-Z0-9]*)$/);

              if (slashMatch) {
                const query = slashMatch[1];
                const pos = $from.pos - query.length - 1;

                if (!active || pos !== slashPos) {
                  active = true;
                  slashPos = pos;
                  // Get cursor position for menu placement
                  const coords = view.coordsAtPos($from.pos);
                  const rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
                  onOpen({ query, clientRect: rect });
                } else {
                  onUpdate({ query });
                }
              } else if (active) {
                active = false;
                slashPos = null;
                onClose();
              }
            },
          };
        },
      }),
    ];
  },
});

interface SlashMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function SlashMenu({ query, position, onSelect, onClose }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = SLASH_COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const el = menu.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const selected = filtered[selectedIndex];
        if (selected) {
          onSelect(selected.id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-56 max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
      style={{ top: position.top + 4, left: position.left }}
    >
      {filtered.map((cmd, index) => {
        const Icon = cmd.icon;
        return (
          <button
            key={cmd.id}
            type="button"
            data-index={index}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
              index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50',
            )}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(cmd.id);
            }}
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col items-start">
              <span>{cmd.label}</span>
              <span className="text-xs text-muted-foreground">{cmd.description}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
