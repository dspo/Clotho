import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Markdown, MarkdownStorage } from 'tiptap-markdown';
import { defaultMarkdownSerializer, MarkdownSerializerState } from 'prosemirror-markdown';
import { Node as PmNode } from 'prosemirror-model';
import { openUrl } from '@tauri-apps/plugin-opener';
import { cn } from '@/lib/utils';
import { SlashMenu, SlashMenuExtension } from './SlashMenu';

// Extend Tiptap Storage type to include markdown
declare module '@tiptap/core' {
  interface Storage {
    markdown: MarkdownStorage;
  }
}

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

// Submit extension: ⌘Enter to blur (which triggers onBlur -> onSubmit)
// We only blur here; onSubmit is called in onBlur to avoid double submission
const createSubmitExtension = () =>
  Extension.create({
    name: 'submit',
    addKeyboardShortcuts() {
      return {
        'Mod-Enter': ({ editor }) => {
          editor.commands.blur();
          return true;
        },
      };
    },
  });

// Link extension with markdown serialization support - singleton instance
// openOnClick is disabled; we handle link clicks manually in readOnly mode
const MarkdownLinkExtension = Link.extend({
  addStorage() {
    return {
      markdown: {
        serialize: defaultMarkdownSerializer.marks.link,
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
}).configure({
  openOnClick: false,
  HTMLAttributes: {
    class: 'text-primary underline underline-offset-2 cursor-pointer',
  },
});

// Image extension with markdown support for tiptap-markdown
const MarkdownImageExtension = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PmNode) {
          state.write(`![${node.attrs.alt || ''}](${node.attrs.src})`);
        },
        parse: {
          // This tells tiptap-markdown to use this extension for images
        },
      },
    };
  },
}).configure({
  inline: true, // Allow images inline with text
  allowBase64: true, // Important: allow base64 data URLs
  HTMLAttributes: {
    class: 'rounded-md max-w-full h-auto',
  },
});

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Called when user submits with ⌘Enter or blur. Editor will lose focus after submit. */
  onSubmit?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  onSubmit,
  placeholder = 'Type / for commands...',
  readOnly = false,
  className,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable link from StarterKit - we use our own MarkdownLinkExtension
        link: false,
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
      MarkdownLinkExtension,
      MarkdownImageExtension,
      Markdown,
      HeadingExitExtension,
      createSubmitExtension(),
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
    content: value || '',
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      // tiptap-markdown: use storage.markdown.getMarkdown()
      const md = ed.storage.markdown.getMarkdown();
      onChangeRef.current(md);
    },
    onBlur: () => {
      onBlurRef.current?.();
      onSubmitRef.current?.();
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
    // tiptap-markdown: getMarkdown() is on storage.markdown
    const currentMd = editor.storage.markdown?.getMarkdown() || '';
    if (currentMd !== value && !editor.isFocused) {
      // tiptap-markdown: setContent automatically parses markdown
      editor.commands.setContent(value || '');
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

  // Handle link clicks in readOnly mode using Tauri opener plugin
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!readOnly) return;
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          openUrl(href).catch(() => {
            // Fallback for dev mode or if plugin fails
            window.open(href, '_blank', 'noopener,noreferrer');
          });
        }
      }
    },
    [readOnly],
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
      onClick={handleClick}
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
