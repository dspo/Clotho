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

    // Quick check: if no image syntax present, skip the backend call
    if (!markdown.includes('![')) {
      setResolved(markdown);
      return;
    }

    let cancelled = false;
    const tid = taskId;
    const md = markdown;

    async function resolve() {
      // Get all images for this task
      let images: Awaited<ReturnType<typeof imageService.list>> = [];
      try {
        images = await imageService.list(tid);
      } catch {
        if (!cancelled) setResolved(md);
        return;
      }

      if (cancelled) return;

      // If no images attached, nothing to resolve
      if (images.length === 0) {
        setResolved(md);
        return;
      }

      // Create a filename -> image map
      const imageByFilename = new Map(images.map(img => [img.filename, img]));

      // Replace all local image references with clotho:// URLs
      // Using String.replace with a global regex and callback to handle all occurrences
      // Supports: ![alt](src) and ![alt](src "title")
      const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
      const result = md.replace(imageRegex, (match, _alt, src) => {
        // Skip URLs, data URIs, and already-converted clotho:// URLs
        if (src.startsWith('http://') ||
            src.startsWith('https://') ||
            src.startsWith('data:') ||
            src.startsWith('clotho://')) {
          return match;
        }

        const image = imageByFilename.get(src);
        if (image) {
          // Preserve original alt text exactly, replace only the src part
          return match.replace(src, `clotho://image/${image.id}`);
        }

        return match;
      });

      if (!cancelled) setResolved(result);
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, [taskId, markdown]);

  return resolved;
}
