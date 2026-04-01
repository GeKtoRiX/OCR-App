import { useCallback, useRef, useState } from 'react';
import { copyToClipboard } from '../shared/lib/clipboard';
import './OcrEditorAiPanel.css';

interface Props {
  open: boolean;
  onClose: () => void;
  contextText: string;
  onApplyToSelection: (text: string) => void;
  onReplaceAll: (text: string) => void;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT =
  'You are a helpful writing assistant. Respond only with the improved or edited text, ' +
  'no explanations, no preamble, no markdown code fences. ' +
  'Match the language of the response to the input unless translation is explicitly requested.';

const COMMANDS: Array<{ label: string; icon: string; prompt: string }> = [
  { label: 'Improve writing', icon: '✨', prompt: 'Improve the writing quality of the following text, making it clearer and more engaging:' },
  { label: 'Fix grammar', icon: '🔧', prompt: 'Fix all grammar and spelling errors in the following text:' },
  { label: 'Make shorter', icon: '📝', prompt: 'Make the following text significantly shorter while preserving the key information:' },
  { label: 'Make longer', icon: '📖', prompt: 'Expand the following text with more detail and elaboration:' },
  { label: 'Summarize', icon: '📋', prompt: 'Summarize the following text in a few concise sentences:' },
  { label: 'Rephrase', icon: '🔄', prompt: 'Rephrase the following text in a different way while keeping the same meaning:' },
  { label: '→ English', icon: '🌐', prompt: 'Translate the following text to English:' },
  { label: '→ Russian', icon: '🌐', prompt: 'Translate the following text to Russian:' },
];

async function* streamAiChat(messages: ChatMessage[]): AsyncGenerator<string> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${errorText}`);
  }

  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as { text?: string; error?: string };
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) yield parsed.text;
        } catch (e) {
          if (e instanceof Error && e.message !== 'JSON parse error') throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function OcrEditorAiPanel({
  open,
  onClose,
  contextText,
  onApplyToSelection,
  onReplaceAll,
}: Props) {
  const [customPrompt, setCustomPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<boolean>(false);

  const runPrompt = useCallback(
    async (promptPrefix: string) => {
      const inputText = contextText || customPrompt;
      if (!inputText.trim() && !promptPrefix) return;

      const userMessage =
        contextText
          ? `${promptPrefix}\n\n${contextText}`
          : promptPrefix
          ? `${promptPrefix}\n\n${customPrompt}`
          : customPrompt;

      if (!userMessage.trim()) return;

      setResponse('');
      setError('');
      setIsLoading(true);
      abortRef.current = false;

      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ];

      let accumulated = '';
      try {
        for await (const chunk of streamAiChat(messages)) {
          if (abortRef.current) break;
          accumulated += chunk;
          setResponse(accumulated);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [contextText, customPrompt],
  );

  const handleCommandClick = useCallback(
    (prompt: string) => {
      void runPrompt(prompt);
    },
    [runPrompt],
  );

  const handleCustomSubmit = useCallback(() => {
    if (!customPrompt.trim()) return;
    void runPrompt('');
  }, [customPrompt, runPrompt]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleApplyToSelection = useCallback(() => {
    if (response) onApplyToSelection(response);
  }, [response, onApplyToSelection]);

  const handleReplaceAll = useCallback(() => {
    if (response) onReplaceAll(response);
  }, [response, onReplaceAll]);

  const handleCopy = useCallback(() => {
    if (response) void copyToClipboard(response);
  }, [response]);

  const handleDiscard = useCallback(() => {
    setResponse('');
    setError('');
    setCustomPrompt('');
  }, []);

  return (
    <div className={`ai-panel${open ? ' ai-panel--open' : ''}`} aria-hidden={!open}>
      <div className="ai-panel__header">
        <span className="ai-panel__title">✦ AI Assistant</span>
        <button className="ai-panel__close" onClick={onClose} aria-label="Close AI panel">
          ✕
        </button>
      </div>

      {contextText && (
        <div className="ai-panel__context">
          <span className="ai-panel__context-label">Selection</span>
          <p className="ai-panel__context-text">{contextText.slice(0, 120)}{contextText.length > 120 ? '…' : ''}</p>
        </div>
      )}

      <div className="ai-panel__commands">
        {COMMANDS.map(cmd => (
          <button
            key={cmd.label}
            className="ai-panel__cmd-chip"
            onClick={() => handleCommandClick(cmd.prompt)}
            disabled={isLoading}
            title={cmd.prompt}
          >
            <span className="ai-panel__cmd-icon">{cmd.icon}</span>
            {cmd.label}
          </button>
        ))}
      </div>

      <div className="ai-panel__input-row">
        <textarea
          className="ai-panel__input"
          placeholder={contextText ? 'Custom instruction for selection…' : 'Type your prompt…'}
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleCustomSubmit();
            }
          }}
          rows={3}
          disabled={isLoading}
        />
        <button
          className="ai-panel__send-btn"
          onClick={handleCustomSubmit}
          disabled={isLoading || !customPrompt.trim()}
          title="Send (Ctrl+Enter)"
        >
          ↑
        </button>
      </div>

      {(isLoading || response || error) && (
        <div className="ai-panel__response-area">
          {isLoading && !response && (
            <div className="ai-panel__thinking">
              <span className="ai-panel__dot" />
              <span className="ai-panel__dot" />
              <span className="ai-panel__dot" />
            </div>
          )}
          {error && <p className="ai-panel__error">{error}</p>}
          {response && (
            <pre className="ai-panel__response">{response}</pre>
          )}
          {isLoading && (
            <button className="ai-panel__stop-btn" onClick={handleStop}>
              ■ Stop
            </button>
          )}
        </div>
      )}

      {response && !isLoading && (
        <div className="ai-panel__actions">
          {contextText && (
            <button className="ai-panel__action-btn ai-panel__action-btn--primary" onClick={handleApplyToSelection}>
              Replace selection
            </button>
          )}
          <button className="ai-panel__action-btn ai-panel__action-btn--primary" onClick={handleReplaceAll}>
            Replace all
          </button>
          <button className="ai-panel__action-btn" onClick={handleCopy}>
            Copy
          </button>
          <button className="ai-panel__action-btn ai-panel__action-btn--discard" onClick={handleDiscard}>
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
