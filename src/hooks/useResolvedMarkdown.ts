import { useState, useEffect } from 'react';
import { imageService } from '@/services/image-service';

/**
 * Hook to resolve image references in markdown content.
 * Converts `![alt](filename.jpg)` to `![alt](clotho://image/{id})` for images
 * that exist in the task's image attachments.
 *
 * The `clotho://` protocol is handled by Tauri's custom protocol handler,
 * which serves images directly as binary data with proper caching headers.
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

      // Filter to only local file references (not URLs, data URIs, or clotho:// protocol)
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

      // Load images metadata to build replacement map
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

      // Build replacements for each filename reference -> clotho:// URL
      for (const [fullMatch, alt, filename] of localRefs) {
        if (cancelled) return;

        const image = imageByFilename.get(filename);
        if (image) {
          // Convert to clotho:// protocol URL
          const clothoUrl = `clotho://image/${image.id}`;
          replacements.set(fullMatch, `![${alt || filename}](${clothoUrl})`);
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
