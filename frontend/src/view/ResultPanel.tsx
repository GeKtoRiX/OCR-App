import type { OcrResponse, VocabType } from '../shared/types';
import type { SaveStatus } from '../features/documents/documents.store';
import {
  TTS_VOICES,
  TTS_LANGS,
  TTS_LANG_LABELS,
  PIPER_VOICES,
  KOKORO_VOICES,
} from '../shared/types';
import { useResultPanel } from './useResultPanel';
import { VocabContextMenu } from '../features/vocabulary/VocabContextMenu';
import { VocabAddForm } from '../features/vocabulary/VocabAddForm';
import './ResultPanel.css';
import './TtsPanel.css';

interface Props {
  result: OcrResponse;
  onSave?: (markdown: string) => void;
  saveStatus?: SaveStatus;
  onUpdate?: (markdown: string) => void;
  isSavedDocument?: boolean;
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
  saveStatus,
  onUpdate,
  isSavedDocument,
  existingWordsSet,
  onAddVocabulary,
}: Props) {
  const panel = useResultPanel({
    result,
    isSavedDocument,
    existingWordsSet,
    onAddVocabulary,
  });
  const { ttsSettings } = panel.tts;

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
          {!isSavedDocument && onSave && (
            <button
              className="result__action-btn result__action-btn--save"
              onClick={() => onSave(panel.editedMarkdown)}
              disabled={saveStatus === 'saving'}
              title="Save to database"
              data-testid="result-save-button"
            >
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                  ? 'Saved ✓'
                  : '💾 Save'}
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

      {panel.tts.ttsOpen && (
        <div className="tts-panel">
          {/* ── Engine toggle ── */}
          <div className="tts-panel__engine-row">
            {(['supertone', 'piper', 'kokoro', 'f5'] as const).map(engine => (
              <button
                key={engine}
                className={`tts-panel__engine-btn ${ttsSettings.engine === engine ? 'tts-panel__engine-btn--active' : ''}`}
                onClick={() => panel.tts.setEngine(engine)}
                data-testid={`tts-engine-${engine}`}
              >
                {engine.charAt(0).toUpperCase() + engine.slice(1)}
              </button>
            ))}
          </div>

          {ttsSettings.engine === 'kokoro' ? (
            /* ── Kokoro settings ── */
            <div className="tts-panel__settings">
              <div className="tts-panel__row">
                <label className="tts-panel__field-label">Voice</label>
                <div className="tts-panel__chips tts-panel__chips--wrap">
                  {KOKORO_VOICES.map(v => (
                    <button
                      key={v.id}
                      className={`tts-panel__chip ${panel.tts.kokoroVoice === v.id ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => panel.tts.setKokoroVoice(v.id)}
                      title={`${v.lang} — ${v.id}`}
                    >
                      <span className="tts-panel__chip-label">{v.label}</span>
                      <span className="tts-panel__chip-lang">{v.lang}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="tts-panel__label">
                <span>Speed</span>
                <span className="tts-panel__value">{ttsSettings.speed.toFixed(2)}×</span>
                <input
                  type="range" min="0.5" max="2.0" step="0.05"
                  value={ttsSettings.speed}
                  onChange={e => panel.tts.setTtsSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
                  className="tts-panel__slider"
                />
              </label>
            </div>

          ) : ttsSettings.engine === 'supertone' ? (
            /* ── Supertone settings ── */
            <div className="tts-panel__settings">
              <div className="tts-panel__row">
                <label className="tts-panel__field-label">Voice</label>
                <div className="tts-panel__chips">
                  {TTS_VOICES.map(v => (
                    <button
                      key={v}
                      className={`tts-panel__chip ${ttsSettings.voice === v ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => panel.tts.setTtsSettings(s => ({ ...s, voice: v }))}
                    >{v}</button>
                  ))}
                </div>
              </div>

              <div className="tts-panel__row">
                <label className="tts-panel__field-label">Language</label>
                <div className="tts-panel__chips">
                  {TTS_LANGS.map(l => (
                    <button
                      key={l}
                      className={`tts-panel__chip ${ttsSettings.lang === l ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => panel.tts.setTtsSettings(s => ({ ...s, lang: l }))}
                      title={TTS_LANG_LABELS[l]}
                    >{l.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              <label className="tts-panel__label">
                <span>Speed</span>
                <span className="tts-panel__value">{ttsSettings.speed.toFixed(2)}×</span>
                <input
                  type="range" min="0.7" max="2.0" step="0.05"
                  value={ttsSettings.speed}
                  onChange={e => panel.tts.setTtsSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
                  className="tts-panel__slider"
                />
              </label>

              <label className="tts-panel__label">
                <span>Quality steps</span>
                <span className="tts-panel__value">{ttsSettings.totalSteps}</span>
                <input
                  type="range" min="1" max="20" step="1"
                  value={ttsSettings.totalSteps}
                  onChange={e => panel.tts.setTtsSettings(s => ({ ...s, totalSteps: parseInt(e.target.value) }))}
                  className="tts-panel__slider"
                />
              </label>
            </div>

          ) : ttsSettings.engine === 'f5' ? (
            /* ── F5 reference voice settings ── */
            <div className="tts-panel__settings">
              <div className="tts-panel__row">
                <label className="tts-panel__field-label" htmlFor="f5-ref-audio">
                  Reference Audio
                </label>
                <input
                  id="f5-ref-audio"
                  className="tts-panel__voice-input"
                  type="file"
                  accept=".wav,.mp3,.flac,.ogg,audio/wav,audio/x-wav,audio/mpeg,audio/flac,audio/ogg"
                  onChange={e => panel.tts.setTtsSettings(s => (
                    s.engine === 'f5'
                      ? { ...s, refAudioFile: e.target.files?.[0] ?? null }
                      : s
                  ))}
                />
              </div>

              <div className="tts-panel__row">
                <label className="tts-panel__field-label" htmlFor="f5-ref-text">
                  Reference Text
                </label>
                <textarea
                  id="f5-ref-text"
                  className="tts-panel__voice-input"
                  value={ttsSettings.refText}
                  onChange={e => panel.tts.setTtsSettings(s => (
                    s.engine === 'f5' ? { ...s, refText: e.target.value } : s
                  ))}
                  placeholder={
                    ttsSettings.autoTranscribe
                      ? 'Reference text will be detected from the uploaded audio'
                      : 'Enter the transcript of the reference audio'
                  }
                  disabled={ttsSettings.autoTranscribe}
                  spellCheck={false}
                  rows={3}
                />
              </div>

              <label className="tts-panel__label">
                <span>Auto-detect reference text</span>
                <input
                  type="checkbox"
                  checked={ttsSettings.autoTranscribe}
                  onChange={e => panel.tts.setTtsSettings(s => (
                    s.engine === 'f5'
                      ? {
                          ...s,
                          autoTranscribe: e.target.checked,
                          refText: e.target.checked ? '' : s.refText,
                        }
                      : s
                  ))}
                />
              </label>

              <label className="tts-panel__label">
                <span>Trim output silence</span>
                <input
                  type="checkbox"
                  checked={ttsSettings.removeSilence}
                  onChange={e => panel.tts.setTtsSettings(s => (
                    s.engine === 'f5' ? { ...s, removeSilence: e.target.checked } : s
                  ))}
                />
              </label>

              <p className="tts-panel__hint">
                F5 uses uploaded reference audio for voice cloning. Keep the clip short. You can provide its transcript manually or let F5 detect it automatically. The first auto-detect run can take much longer because the ASR model may need to download.
              </p>
            </div>

          ) : ttsSettings.engine === 'piper' ? (
            /* ── Piper settings ── */
            <div className="tts-panel__settings">
              <div className="tts-panel__row">
                <label className="tts-panel__field-label">Voice</label>
                <div className="tts-panel__chips tts-panel__chips--wrap">
                  {PIPER_VOICES.map(v => (
                    <button
                      key={v.id}
                      className={`tts-panel__chip ${panel.tts.piperVoice === v.id ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => panel.tts.setPiperVoice(v.id)}
                      title={`${v.lang} — ${v.id}`}
                    >
                      <span className="tts-panel__chip-label">{v.label}</span>
                      <span className="tts-panel__chip-lang">{v.lang}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="tts-panel__row">
                <label className="tts-panel__field-label">Custom voice</label>
                <input
                  className="tts-panel__voice-input"
                  type="text"
                  value={panel.tts.piperVoice}
                  onChange={e => panel.tts.setPiperVoice(e.target.value)}
                  placeholder="e.g. en_US-amy-medium"
                  spellCheck={false}
                />
              </div>

              <label className="tts-panel__label">
                <span>Speed</span>
                <span className="tts-panel__value">{ttsSettings.speed.toFixed(2)}×</span>
                <input
                  type="range" min="0.5" max="2.0" step="0.05"
                  value={ttsSettings.speed}
                  onChange={e => panel.tts.setTtsSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
                  className="tts-panel__slider"
                />
              </label>

              <p className="tts-panel__hint">
                First use downloads the voice model (~30–100 MB). Full list:{' '}
                <a href="https://rhasspy.github.io/piper-samples/" target="_blank" rel="noreferrer">
                  piper-samples
                </a>
              </p>
            </div>
          ) : null}

          {panel.tts.audioUrl && (
            <div className="tts-panel__player">
              <div className="tts-panel__player-main">
                <audio
                  ref={panel.tts.audioRef}
                  controls
                  src={panel.tts.audioUrl}
                  className="tts-panel__audio"
                  data-testid="tts-audio-player"
                />
                <a
                  href={panel.tts.audioUrl}
                  download={panel.tts.audioFilename}
                  className="tts-panel__download"
                  title="Download WAV"
                >
                  ↓ WAV
                </a>
              </div>
              <div className="tts-panel__playrate">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
                  <button
                    key={r}
                    className={`tts-panel__rate-btn ${panel.tts.playbackRate === r ? 'tts-panel__rate-btn--active' : ''}`}
                    onClick={() => panel.tts.setPlaybackRate(r)}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="tts-panel__footer">
            {panel.tts.ttsError && <span className="tts-panel__error">{panel.tts.ttsError}</span>}
            <button
              className="btn btn--primary tts-panel__generate"
              onClick={() => void panel.tts.handleGenerate()}
              disabled={panel.tts.ttsStatus === 'loading' || !panel.tts.canGenerate}
              data-testid="tts-generate-button"
            >
              {panel.tts.ttsStatus === 'loading' ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
