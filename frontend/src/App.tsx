import { useImageUpload } from './viewmodel/useImageUpload';
import { useOCR } from './viewmodel/useOCR';
import { useHealthStatus } from './viewmodel/useHealthStatus';
import { DropZone } from './view/DropZone';
import { ResultPanel } from './view/ResultPanel';
import { StatusBar } from './view/StatusBar';
import { StatusLight } from './view/StatusLight';

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const WORKFLOW_STEPS = [
  'Upload an image by clicking, dragging and dropping, or pasting from clipboard via Ctrl+V.',
  'PaddleOCR extracts raw text, then LM Studio structures it into clean Markdown.',
  'Copy the Markdown or raw text with one click and use it in your document.',
];

const HEALTH_LABELS = {
  blue: 'All systems ready',
  green: 'OCR ready',
  yellow: 'CPU mode',
  red: 'Service issue',
} as const;

export default function App() {
  const upload = useImageUpload();
  const ocr = useOCR();
  const health = useHealthStatus();

  const handleProcess = () => {
    if (upload.file) ocr.run(upload.file);
  };

  const handleReset = () => {
    upload.clear();
    ocr.reset();
  };

  const isProcessing = ocr.status === 'loading';
  const result = ocr.result;
  const hasResult = result !== null;
  const fileMeta = upload.file
    ? `${formatFileSize(upload.file.size)} · ${upload.file.type || 'image'}`
    : null;

  return (
    <div className="app">
      <main className="workspace">
        <section className="panel panel--upload">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Upload</span>
              <h2>Prepare source image</h2>
            </div>
            <span className={`panel__badge ${upload.file ? 'panel__badge--ready' : ''}`}>
              {upload.file ? 'File selected' : 'Awaiting file'}
            </span>
          </div>

          <DropZone
            preview={upload.preview}
            fileName={upload.file?.name ?? null}
            fileMeta={fileMeta}
            onFileChange={upload.onFileChange}
            onDrop={upload.onDrop}
            disabled={isProcessing}
          />

          {upload.error && <div className="inline-alert inline-alert--error">{upload.error}</div>}

          <div className="app__actions">
            <button
              className="btn btn--primary"
              onClick={handleProcess}
              disabled={!upload.file || isProcessing}
            >
              {isProcessing ? 'Processing…' : 'Recognize'}
            </button>
            <button
              className="btn btn--secondary"
              onClick={handleReset}
              disabled={isProcessing}
            >
              Clear
            </button>
          </div>

          <StatusBar status={ocr.status} error={ocr.error} />
        </section>

        <aside className="sidebar">
          <section className="panel panel--notes">
            <div className="panel__heading">
              <div>
                <span className="panel__eyebrow">Pipeline</span>
                <h2>How it works</h2>
              </div>
              <StatusLight
                color={health.color}
                label={HEALTH_LABELS[health.color]}
                tooltip={health.tooltip}
              />
            </div>
            <ol className="workflow">
              {WORKFLOW_STEPS.map((step, index) => (
                <li key={step} className="workflow__item">
                  <span className="workflow__index">0{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel panel--notes">
            <span className="panel__eyebrow">Current file</span>
            <h2>{upload.file?.name ?? 'No file loaded'}</h2>
            <p className="panel__text">
              {upload.file
                ? `Image ready for OCR: ${fileMeta}`
                : 'Images up to 10 MB supported. Use Ctrl+V for quick paste.'}
            </p>
          </section>
        </aside>

        <section className="panel panel--result">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Result</span>
              <h2>Recognition output</h2>
            </div>
            <span className={`panel__badge ${hasResult ? 'panel__badge--ready' : ''}`}>
              {hasResult ? 'Ready' : 'Empty'}
            </span>
          </div>

          {result ? (
            <ResultPanel result={result} />
          ) : (
            <div className="result-empty">
              <strong>Structured output will appear here</strong>
              <p>
                After processing, switch between Markdown and raw text and copy either format with one click.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
