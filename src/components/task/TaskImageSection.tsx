import { useState, useEffect, useCallback, useRef } from 'react';
import { ImagePlus, X, Loader2, Copy, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { imageService } from '@/services/image-service';
import type { TaskImage } from '@/types/task';

interface TaskImageSectionProps {
  taskId: string;
}

export function TaskImageSection({ taskId }: TaskImageSectionProps) {
  const [images, setImages] = useState<TaskImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    const ref = `![${image.filename}](${image.filename})`;
    navigator.clipboard.writeText(ref);
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Images {images.length > 0 && `(${images.length})`}
        </label>
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
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : images.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-md border border-dashed py-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          Click to upload images
        </div>
      ) : (
        <div className="space-y-1">
          {images.map((img) => (
            <div
              key={img.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50 transition-colors"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm truncate">{img.filename}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Copy markdown reference"
                  onClick={() => handleCopyRef(img)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  title="Delete"
                  onClick={() => handleDelete(img.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
