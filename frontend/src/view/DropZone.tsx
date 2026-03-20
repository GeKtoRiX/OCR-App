import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import './DropZone.css';

interface Props {
  preview: string | null;
  fileName?: string | null;
  fileMeta?: string | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: DragEvent) => void;
  disabled?: boolean;
}

export function DropZone({
  preview,
  fileName,
  fileMeta,
  onFileChange,
  onDrop,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: DragEvent) => {
    setDragOver(false);
    onDrop(e);
  };

  return (
    <div
      className={`dropzone ${dragOver ? 'dropzone--active' : ''} ${disabled ? 'dropzone--disabled' : ''}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff"
        onChange={onFileChange}
        hidden
        disabled={disabled}
      />
      {preview ? (
        <div className="dropzone__preview-shell">
          <img
            src={preview}
            alt="Uploaded image preview"
            className="dropzone__preview"
          />
          <div className="dropzone__preview-meta">
            <strong>{fileName ?? 'Image ready for processing'}</strong>
            <span>{fileMeta ?? 'Click to replace file'}</span>
          </div>
        </div>
      ) : (
        <div className="dropzone__placeholder">
          <span className="dropzone__eyebrow">Input</span>
          <h3>Drop an image here</h3>
          <p>
            Click to select a file, drag and drop, or paste from clipboard via Ctrl+V.
          </p>
          <div className="dropzone__capsules">
            <span>Click to upload</span>
            <span>Drag and drop</span>
            <span>Ctrl+V</span>
          </div>
          <p className="dropzone__hint">PNG, JPEG, WebP, BMP, TIFF · up to 10 MB</p>
        </div>
      )}
    </div>
  );
}
