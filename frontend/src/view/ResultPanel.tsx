import { useState } from 'react';
import type { OcrResponse } from '../model/types';
import { copyToClipboard } from '../model/clipboard';

interface Props {
  result: OcrResponse;
}

type Tab = 'markdown' | 'raw';

export function ResultPanel({ result }: Props) {
  const [tab, setTab] = useState<Tab>('markdown');
  const activeContent = tab === 'markdown' ? result.markdown : result.rawText;

  const handleCopy = () => {
    void copyToClipboard(activeContent);
  };

  return (
    <div className="result">
      <div className="result__summary">
        <div>
          <span className="result__eyebrow">OCR output</span>
          <h3 className="result__title">{result.filename}</h3>
        </div>
        <div className="result__stats">
          <span className="result__stat">
            Raw: {result.rawText.length.toLocaleString('en-US')} chars
          </span>
          <span className="result__stat">
            Markdown: {result.markdown.length.toLocaleString('en-US')} chars
          </span>
        </div>
      </div>

      <div className="result__header">
        <div className="result__tabs">
          <button
            className={`result__tab ${tab === 'markdown' ? 'result__tab--active' : ''}`}
            onClick={() => setTab('markdown')}
          >
            Markdown
          </button>
          <button
            className={`result__tab ${tab === 'raw' ? 'result__tab--active' : ''}`}
            onClick={() => setTab('raw')}
          >
            Raw Text
          </button>
        </div>
        <button className="result__copy" onClick={handleCopy}>
          Copy
        </button>
      </div>
      <pre className="result__content">{activeContent}</pre>
    </div>
  );
}
