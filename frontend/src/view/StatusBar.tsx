import type { OcrStatus } from '../viewmodel/useOCR';

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
  if (status === 'idle') return null;

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
