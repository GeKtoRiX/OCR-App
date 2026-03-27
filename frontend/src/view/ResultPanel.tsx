import type { OcrResponse, VocabType } from '../shared/types';
import type { SaveStatus } from '../features/documents/documents.store';
import { useResultPanel } from './useResultPanel';
import { VocabContextMenu } from '../features/vocabulary/VocabContextMenu';
import { VocabAddForm } from '../features/vocabulary/VocabAddForm';
import { TtsSettingsPanel } from './TtsSettingsPanel';
import './ResultPanel.css';

interface Props {
  result: OcrResponse;
  onSave?: (markdown: string) => void;
  onSaveVocabulary?: () => void;
  saveStatus?: SaveStatus;
  onUpdate?: (markdown: string) => void;
  isSavedDocument?: boolean;
  vocabularyDisabled?: boolean;
  existingWordsSet?: Set<string>;
  onAddVocabulary?: (
    word: string,
    vocabType: VocabType,
    translation: string,
    contextSentence: string,
  ) => void;
}

export function ResultPanel({
  result,
  onSave,
  onSaveVocabulary,
  saveStatus,
  onUpdate,
  isSavedDocument,
  vocabularyDisabled,
  existingWordsSet,
  onAddVocabulary,
}: Props) {
  const panel = useResultPanel({
    result,
    isSavedDocument,
    existingWordsSet,
    onAddVocabulary,
  });

  return (
    <div className="result">
      <div className="result__summary">
        <div>
          <span className="result__eyebrow">OCR output</span>
          <h3 className="result__title">{result.filename}</h3>
        </div>
        <div className="result__stats">
          <span className="result__stat">
            Raw: {panel.rawCharCount.toLocaleString('en-US')} chars
          </span>
          <span className="result__stat">
            Markdown: {panel.markdownCharCount.toLocaleString('en-US')} chars
          </span>
        </div>
      </div>

      <div className="result__header">
        <div className="result__tabs">
          <button
            className={`result__tab ${panel.tab === 'markdown' ? 'result__tab--active' : ''}`}
            onClick={() => panel.setTab('markdown')}
            data-testid="result-tab-markdown"
          >
            Markdown
          </button>
          {panel.showRawTab && (
            <button
              className={`result__tab ${panel.tab === 'raw' ? 'result__tab--active' : ''}`}
              onClick={() => panel.setTab('raw')}
              data-testid="result-tab-raw"
            >
              Raw Text
            </button>
          )}
        </div>
        <div className="result__actions">
          <button
            className={`result__action-btn ${panel.isEditing ? 'result__action-btn--active' : ''}`}
            onClick={() => panel.setIsEditing(v => !v)}
            title={panel.isEditing ? 'Finish editing' : 'Edit text'}
            data-testid="result-edit-toggle"
          >
            {panel.isEditing ? 'Done' : 'Edit'}
          </button>
          <button className="result__copy" onClick={panel.handleCopy} data-testid="result-copy-button">
            {panel.copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            className={`result__action-btn ${panel.tts.ttsOpen ? 'result__action-btn--active' : ''}`}
            onClick={() => panel.tts.setTtsOpen(v => !v)}
            title="Text-to-speech"
            data-testid="result-tts-toggle"
          >
            🔊 TTS
          </button>
          {isSavedDocument && onUpdate && panel.isEditing && (
            <button
              className="result__action-btn result__action-btn--save"
              onClick={() => onUpdate(panel.editedMarkdown)}
              title="Update saved document"
              data-testid="result-update-button"
            >
              Update
            </button>
          )}
          {isSavedDocument && onSaveVocabulary && (
            <button
              className="result__action-btn result__action-btn--save"
              onClick={onSaveVocabulary}
              disabled={vocabularyDisabled || panel.isEditing}
              title="Prepare vocabulary candidates"
              data-testid="result-save-vocabulary-button"
            >
              Save Vocabulary
            </button>
          )}
          {!isSavedDocument && onSave && (
            <button
              className="result__action-btn result__action-btn--save"
              onClick={() => onSave(panel.editedMarkdown)}
              disabled={saveStatus === 'saving'}
              title="Save Document"
              data-testid="result-save-button"
            >
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                  ? 'Saved ✓'
                  : 'Save Document'}
            </button>
          )}
        </div>
      </div>

      {panel.isEditing ? (
        <textarea
          ref={panel.textareaRef}
          className="result__editor"
          data-testid="result-editor"
          value={panel.activeContent}
          onChange={e => panel.setActiveContent(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <pre
          ref={panel.contentRef}
          className="result__content"
          data-testid="result-content"
          onMouseUp={panel.vocabCtx.rememberRenderedSelection}
          onKeyUp={panel.vocabCtx.rememberRenderedSelection}
          onMouseDownCapture={panel.vocabCtx.handleRenderedMouseDownCapture}
          onContextMenu={panel.vocabCtx.handleRenderedContextMenu}
        >
          {panel.activeContent}
        </pre>
      )}

      {panel.vocabCtx.contextMenu && (
        <VocabContextMenu
          x={panel.vocabCtx.contextMenu.x}
          y={panel.vocabCtx.contextMenu.y}
          onSelect={panel.vocabCtx.handleVocabTypeSelect}
          onClose={panel.vocabCtx.closeContextMenu}
        />
      )}

      {panel.vocabCtx.vocabForm && (
        <VocabAddForm
          x={panel.vocabCtx.vocabForm.x}
          y={panel.vocabCtx.vocabForm.y}
          selectedText={panel.vocabCtx.vocabForm.selectedText}
          vocabType={panel.vocabCtx.vocabForm.vocabType}
          isDuplicate={panel.vocabCtx.vocabForm.isDuplicate}
          onAdd={panel.vocabCtx.handleVocabAdd}
          onClose={panel.vocabCtx.closeVocabForm}
        />
      )}

      {panel.tts.ttsOpen && <TtsSettingsPanel tts={panel.tts} />}
    </div>
  );
}
