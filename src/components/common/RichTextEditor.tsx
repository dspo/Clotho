import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import { cn } from '@/lib/utils';
import { SlashMenu, SlashMenuExtension } from './SlashMenu';

// Exit heading on Enter when the current heading is empty (standard editor behavior)
const HeadingExitExtension = Extension.create({
  name: 'headingExit',
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name === 'heading' && $from.parent.textContent === '') {
          editor.commands.clearNodes();
          return true;
        }
        return false;
      },
    };
  },
});

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Type / for commands...',
  readOnly = false,
  className,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: 'rounded-md bg-muted p-3 font-mono text-sm',
          },
        },
        heading: {
          levels: [1, 2, 3],
        },
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyNodeClass: 'before:content-[attr(data-placeholder)] before:text-muted-foreground/50 before:float-left before:h-0 before:pointer-events-none',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-2 cursor-pointer',
        },
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: {
          class: 'rounded-md max-w-full h-auto',
        },
      }),
      Markdown,
      HeadingExitExtension,
      SlashMenuExtension.configure({
        onOpen: ({ query, clientRect }) => {
          setSlashQuery(query);
          if (clientRect) {
            const containerRect = editorContainerRef.current?.getBoundingClientRect();
            if (containerRect) {
              setSlashMenuPos({
                top: clientRect.bottom - containerRect.top,
                left: clientRect.left - containerRect.left,
              });
            }
          }
          setSlashMenuOpen(true);
        },
        onClose: () => {
          setSlashMenuOpen(false);
          setSlashQuery('');
        },
        onUpdate: ({ query }) => {
          setSlashQuery(query);
        },
      }),
    ],
    content: '',
    editable: !readOnly,
    onCreate: ({ editor: ed }) => {
      if (value) {
        // Use the markdown manager's parse method for proper markdown rendering
        const mdManager = ed.storage.markdown?.manager;
        if (mdManager) {
          const parsed = mdManager.parse(value);
          ed.commands.setContent(parsed);
        } else {
          ed.commands.setContent(value);
        }
      }
    },
    onUpdate: ({ editor: ed }) => {
      const md = ed.getMarkdown();
      onChangeRef.current(md);
    },
    onBlur: () => {
      onBlurRef.current?.();
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
          'prose-headings:font-semibold prose-headings:tracking-tight',
          '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-4',
          '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-3',
          '[&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-2',
          'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
          'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:font-mono',
          'min-h-[80px]',
        ),
      },
    },
  });

  // Sync readOnly
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  // Sync external value changes
  useEffect(() => {
    if (!editor) return;
    const currentMd = editor.getMarkdown();
    if (currentMd !== value && !editor.isFocused) {
      const mdManager = editor.storage.markdown?.manager;
      if (mdManager) {
        const parsed = mdManager.parse(value || '');
        editor.commands.setContent(parsed);
      } else {
        editor.commands.setContent(value || '');
      }
    }
  }, [editor, value]);

  const handleSlashCommand = useCallback(
    (command: string) => {
      if (!editor) return;
      setSlashMenuOpen(false);

      // Find the slash and query text position
      const { state } = editor;
      const { from } = state.selection;
      const text = state.doc.textBetween(
        Math.max(0, from - slashQuery.length - 1),
        from,
        '\0',
      );
      const slashIndex = text.lastIndexOf('/');
      const deleteFrom = slashIndex >= 0 ? from - (text.length - slashIndex) : from;

      // Execute delete and format in a single atomic chain
      // This ensures the format is applied to the correct block after deletion
      switch (command) {
        case 'paragraph':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).clearNodes().run();
          break;
        case 'heading1':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).setHeading({ level: 1 }).run();
          break;
        case 'heading2':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).setHeading({ level: 2 }).run();
          break;
        case 'heading3':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).setHeading({ level: 3 }).run();
          break;
        case 'bulletList':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).toggleBulletList().run();
          break;
        case 'orderedList':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).toggleOrderedList().run();
          break;
        case 'blockquote':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).setBlockquote().run();
          break;
        case 'codeBlock':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).toggleCodeBlock().run();
          break;
        case 'horizontalRule':
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).setHorizontalRule().run();
          break;
        case 'link': {
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
          const url = window.prompt('Enter URL:');
          if (url) {
            const linkText = window.prompt('Link text:', url) || url;
            editor
              .chain()
              .focus()
              .insertContent(`<a href="${url}">${linkText}</a>`)
              .run();
          }
          break;
        }
        case 'image': {
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
          const imgUrl = window.prompt('Enter image URL (or clotho://image/{id}):');
          if (imgUrl) {
            editor
              .chain()
              .focus()
              .setImage({ src: imgUrl })
              .run();
          }
          break;
        }
      }
    },
    [editor, slashQuery],
  );

  return (
    <div
      ref={editorContainerRef}
      className={cn(
        'relative rounded-md border bg-background text-sm',
        readOnly && 'border-transparent',
        !readOnly && 'focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      <EditorContent
        editor={editor}
        className={cn(
          'px-3 py-2',
          readOnly && 'px-0 py-0',
        )}
      />
      {slashMenuOpen && slashMenuPos && (
        <SlashMenu
          query={slashQuery}
          position={slashMenuPos}
          onSelect={handleSlashCommand}
          onClose={() => setSlashMenuOpen(false)}
        />
      )}
    </div>
  );
}
