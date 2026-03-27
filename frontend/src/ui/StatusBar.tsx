import { useState, useEffect } from 'react';
import type { OcrStatus } from '../features/ocr/ocr.store';
import './StatusBar.css';

interface Props {
  status: OcrStatus;
  error: string | null;
}

const titles: Record<OcrStatus, string> = {
  idle: '',
  loading: 'Processing',
  success: 'Done',
  error: 'Error',
};

const descriptions: Record<OcrStatus, string> = {
  idle: '',
  loading: 'Extracting text and building structured output.',
  success: 'OCR complete. Result available below.',
  error: 'An error occurred during processing.',
};

export function StatusBar({ status, error }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (status === 'success') {
      const id = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(id);
    }
  }, [status]);

  if (status === 'idle' || !visible) return null;

  return (
    <div className={`status status--${status}`} role="status">
      <div className="status__indicator">
        {status === 'loading' ? <span className="status__spinner" /> : <span className="status__dot" />}
      </div>
      <div className="status__body">
        <strong>{titles[status]}</strong>
        <span>{error ?? descriptions[status]}</span>
      </div>
    </div>
  );
}
