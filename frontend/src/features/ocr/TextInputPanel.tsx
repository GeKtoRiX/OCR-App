import type { FormEvent } from 'react';
import './DropZone.css';

interface Props {
  text: string;
  filename: string;
  canSubmit: boolean;
  disabled?: boolean;
  onTextChange: (value: string) => void;
  onFilenameChange: (value: string) => void;
  onSubmit: () => void;
}

export function TextInputPanel({
  text,
  filename,
  canSubmit,
  disabled,
  onTextChange,
  onFilenameChange,
  onSubmit,
}: Props) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit || disabled) {
      return;
    }

    onSubmit();
  };

  return (
    <form className="text-input-panel" onSubmit={handleSubmit}>
      <div className="text-input-panel__intro">
        <span className="dropzone__eyebrow">Input</span>
        <h3>Paste or type document text</h3>
        <p>Load pre-formatted text directly into the same result flow used for OCR output.</p>
      </div>

      <label className="text-input-panel__field">
        <span>Document name</span>
        <input
          type="text"
          value={filename}
          onChange={(event) => onFilenameChange(event.target.value)}
          placeholder="document name"
          disabled={disabled}
        />
      </label>

      <label className="text-input-panel__field text-input-panel__field--grow">
        <span>Text content</span>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste markdown or plain text here"
          disabled={disabled}
        />
      </label>

    </form>
  );
}
