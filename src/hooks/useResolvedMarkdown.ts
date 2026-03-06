import { useState, useEffect } from 'react';
import { imageService } from '@/services/image-service';

/**
 * Hook to resolve image references in markdown content.
 * Converts `![alt](filename.jpg)` to `![alt](data:image/...;base64,...)` for images
 * that exist in the task's image attachments.
 */
export function useResolvedMarkdown(taskId: string | null, markdown: string | null): string {
  const [resolved, setResolved] = useState(markdown ?? '');

  useEffect(() => {
    if (!taskId || !markdown) {
      setResolved(markdown ?? '');
      return;
    }

    let cancelled = false;
    const tid = taskId; // Capture for closure (narrowed to string)
    const md = markdown; // Capture for closure

    async function resolve() {
      // Find all image references: ![alt](src)
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const matches = [...md.matchAll(imageRegex)];

      if (matches.length === 0) {
        setResolved(md);
        return;
      }

      // Filter to only local file references (not URLs or data URIs)
      const localRefs = matches.filter(([, , src]) => {
        return !src.startsWith('http://') &&
               !src.startsWith('https://') &&
               !src.startsWith('data:') &&
               !src.startsWith('clotho://');
      });

      if (localRefs.length === 0) {
        setResolved(md);
        return;
      }

      // Load images and build replacement map
      const replacements = new Map<string, string>();

      // Get all images for this task
      let images: Awaited<ReturnType<typeof imageService.list>> = [];
      try {
        images = await imageService.list(tid);
      } catch {
        setResolved(md);
        return;
      }

      // Create a filename -> image map
      const imageByFilename = new Map(images.map(img => [img.filename, img]));

      // Load each referenced image
      for (const [fullMatch, alt, filename] of localRefs) {
        if (cancelled) return;

        const image = imageByFilename.get(filename);
        if (image) {
          try {
            const base64 = await imageService.get(image.id);
            const dataUrl = `data:${image.mime_type};base64,${base64}`;
            replacements.set(fullMatch, `![${alt || filename}](${dataUrl})`);
          } catch {
            // Keep original reference if loading fails
          }
        }
      }

      if (cancelled) return;

      // Apply replacements
      let result = md;
      for (const [original, replacement] of replacements) {
        result = result.replace(original, replacement);
      }

      setResolved(result);
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, [taskId, markdown]);

  return resolved;
}
