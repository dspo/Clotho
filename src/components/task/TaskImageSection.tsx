import { useState, useEffect, useCallback, useRef } from 'react';
import { ImagePlus, X, Loader2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { imageService } from '@/services/image-service';
import type { TaskImage } from '@/types/task';

interface TaskImageSectionProps {
  taskId: string;
}

export function TaskImageSection({ taskId }: TaskImageSectionProps) {
  const [images, setImages] = useState<TaskImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const list = await imageService.list(taskId);
      setImages(list);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Load image data for previews
  useEffect(() => {
    const urls = new Map<string, string>();
    let cancelled = false;

    async function loadAll() {
      for (const img of images) {
        if (cancelled) break;
        try {
          const base64 = await imageService.get(img.id);
          urls.set(img.id, `data:${img.mime_type};base64,${base64}`);
        } catch {
          // skip
        }
      }
      if (!cancelled) {
        setImageUrls(new Map(urls));
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [images]);

  const handleUpload = useCallback(async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        const data = Array.from(new Uint8Array(buffer));
        await imageService.upload(taskId, file.name, data, file.type);
      }
      await fetchImages();
    } catch {
      // silently fail
    } finally {
      setUploading(false);
    }
  }, [taskId, fetchImages]);

  const handleDelete = useCallback(async (imageId: string) => {
    try {
      await imageService.delete(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch {
      // silently fail
    }
  }, []);

  const handleCopyRef = useCallback((image: TaskImage) => {
    const ref = `![${image.filename}](clotho://image/${image.id})`;
    navigator.clipboard.writeText(ref);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">Images</label>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <ImagePlus className="h-3 w-3 mr-1" />
          )}
          Add
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUpload(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {loading && images.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : images.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-md border border-dashed py-4 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          Click to upload images
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => {
            const url = imageUrls.get(img.id);
            return (
              <div
                key={img.id}
                className="group relative aspect-square rounded-md border overflow-hidden bg-muted/30"
              >
                {url ? (
                  <img
                    src={url}
                    alt={img.filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                <div className={cn(
                  'absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity',
                  'flex items-center justify-center gap-1',
                )}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20"
                    title="Copy reference"
                    onClick={(e) => { e.stopPropagation(); handleCopyRef(img); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20"
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.filename}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
