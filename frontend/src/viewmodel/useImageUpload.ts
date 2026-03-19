import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ChangeEvent,
  type DragEvent,
} from 'react';

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export function useImageUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (!previewUrlRef.current) {
      return;
    }

    URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const validate = useCallback((f: File): string | null => {
    if (!ALLOWED_TYPES.has(f.type))
      return `ÐÐµÐ¿Ð¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÐ¼Ñ‹Ð¹ Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚: ${f.type}`;
    if (f.size > MAX_SIZE)
      return 'Ð¤Ð°Ð¹Ð» ÑÐ»Ð¸ÑˆÐºÐ¾Ð¼ Ð±Ð¾Ð»ÑŒÑˆÐ¾Ð¹ (Ð¼Ð°ÐºÑ. 10 ÐœÐ‘)';
    return null;
  }, []);

  const selectFile = useCallback(
    (f: File) => {
      const err = validate(f);
      if (err) {
        setError(err);
        return;
      }

      revokePreviewUrl();
      setError(null);
      setFile(f);

      const nextPreviewUrl = URL.createObjectURL(f);
      previewUrlRef.current = nextPreviewUrl;
      setPreview(nextPreviewUrl);
    },
    [revokePreviewUrl, validate],
  );

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) selectFile(f);
    },
    [selectFile],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) selectFile(f);
    },
    [selectFile],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            selectFile(f);
          }
          return;
        }
      }
    },
    [selectFile],
  );

  useEffect(() => {
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
      revokePreviewUrl();
    };
  }, [onPaste, revokePreviewUrl]);

  const clear = useCallback(() => {
    revokePreviewUrl();
    setFile(null);
    setPreview(null);
    setError(null);
  }, [revokePreviewUrl]);

  return { file, preview, error, onFileChange, onDrop, clear };
}
