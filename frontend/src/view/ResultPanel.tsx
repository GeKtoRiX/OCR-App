import { useState, useCallback, useEffect, useRef } from 'react';
import type { OcrResponse, VocabType } from '../model/types';
import type { SaveStatus } from '../viewmodel/useSavedDocuments';
import {
  TTS_VOICES,
  TTS_LANGS,
  TTS_LANG_LABELS,
  PIPER_VOICES,
  KOKORO_VOICES,
  QWEN_TTS_LANGS,
  QWEN_TTS_SPEAKERS,
} from '../model/types';
import { copyToClipboard } from '../model/clipboard';
import { useTts } from '../viewmodel/useTts';
import { VocabContextMenu } from './VocabContextMenu';
import { VocabAddForm } from './VocabAddForm';
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

type Tab = 'markdown' | 'raw';

export function ResultPanel({
  result,
  onSave,
  saveStatus,
  onUpdate,
  isSavedDocument,
  existingWordsSet,
  onAddVocabulary,
}: Props) {
  const [tab, setTab] = useState<Tab>('markdown');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState(result.markdown);
  const [editedRaw, setEditedRaw] = useState(result.rawText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Vocab context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
    contextSentence: string;
  } | null>(null);
  const [vocabForm, setVocabForm] = useState<{
    x: number;
    y: number;
    selectedText: string;
    contextSentence: string;
    vocabType: VocabType;
    isDuplicate: boolean;
  } | null>(null);

  useEffect(() => {
    setEditedMarkdown(result.markdown);
    setEditedRaw(result.rawText);
    setIsEditing(false);
  }, [result]);

  const activeContent = tab === 'markdown' ? editedMarkdown : editedRaw;
  const setActiveContent = tab === 'markdown' ? setEditedMarkdown : setEditedRaw;

  const handleCopy = useCallback(() => {
    void copyToClipboard(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [activeContent]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (tab !== 'markdown' || !onAddVocabulary) return;
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start === end) return; // no selection → default menu
      e.preventDefault();
      const text = textarea.value.substring(start, end).trim();
      if (!text) return;

      // Extract context sentence around selection
      const before = textarea.value.substring(0, start);
      const after = textarea.value.substring(end);
      const sentenceStart = Math.max(
        before.lastIndexOf('.') + 1,
        before.lastIndexOf('\n') + 1,
        0,
      );
      const dotAfter = after.indexOf('.');
      const nlAfter = after.indexOf('\n');
      const sentenceEnd =
        dotAfter >= 0 && (nlAfter < 0 || dotAfter < nlAfter)
          ? end + dotAfter + 1
          : nlAfter >= 0
            ? end + nlAfter
            : textarea.value.length;
      const contextSentence = textarea.value
        .substring(sentenceStart, sentenceEnd)
        .trim();

      setContextMenu({ x: e.clientX, y: e.clientY, selectedText: text, contextSentence });
      setVocabForm(null);
    },
    [tab, onAddVocabulary],
  );

  const handleVocabTypeSelect = useCallback(
    (vocabType: VocabType) => {
      if (!contextMenu) return;
      const isDuplicate = existingWordsSet
        ? existingWordsSet.has(contextMenu.selectedText.toLowerCase())
        : false;
      setVocabForm({
        x: contextMenu.x,
        y: contextMenu.y,
        selectedText: contextMenu.selectedText,
        contextSentence: contextMenu.contextSentence,
        vocabType,
        isDuplicate,
      });
      setContextMenu(null);
    },
    [contextMenu, existingWordsSet],
  );

  const handleVocabAdd = useCallback(
    (translation: string) => {
      if (!vocabForm || !onAddVocabulary) return;
      onAddVocabulary(
        vocabForm.selectedText,
        vocabForm.vocabType,
        translation,
        vocabForm.contextSentence,
      );
      setVocabForm(null);
    },
    [vocabForm, onAddVocabulary],
  );

  const tts = useTts(activeContent, result.filename);
  const { ttsSettings } = tts;

  return (
    <div className="result">
      <div className="result__summary">
        <div>
          <span className="result__eyebrow">OCR output</span>
          <h3 className="result__title">{result.filename}</h3>
        </div>
        <div className="result__stats">
          <span className="result__stat">
            Raw: {editedRaw.length.toLocaleString('en-US')} chars
          </span>
          <span className="result__stat">
            Markdown: {editedMarkdown.length.toLocaleString('en-US')} chars
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
          {!isSavedDocument && (
            <button
              className={`result__tab ${tab === 'raw' ? 'result__tab--active' : ''}`}
              onClick={() => setTab('raw')}
            >
              Raw Text
            </button>
          )}
        </div>
        <div className="result__actions">
          <button
            className={`result__action-btn ${isEditing ? 'result__action-btn--active' : ''}`}
            onClick={() => setIsEditing(v => !v)}
            title={isEditing ? 'Finish editing' : 'Edit text'}
          >
            {isEditing ? 'Done' : 'Edit'}
          </button>
          <button className="result__copy" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            className={`result__action-btn ${tts.ttsOpen ? 'result__action-btn--active' : ''}`}
            onClick={() => tts.setTtsOpen(v => !v)}
            title="Text-to-speech"
          >
            🔊 TTS
          </button>
          {isSavedDocument && onUpdate && isEditing && (
            <button
              className="result__action-btn result__action-btn--save"
              onClick={() => onUpdate(editedMarkdown)}
              title="Update saved document"
            >
              Update
            </button>
          )}
          {!isSavedDocument && onSave && (
            <button
              className="result__action-btn result__action-btn--save"
              onClick={() => onSave(editedMarkdown)}
              disabled={saveStatus === 'saving'}
              title="Save to database"
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

      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="result__editor"
          value={activeContent}
          onChange={e => setActiveContent(e.target.value)}
          onContextMenu={handleContextMenu}
          spellCheck={false}
        />
      ) : (
        <pre className="result__content">{activeContent}</pre>
      )}

      {contextMenu && (
        <VocabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={handleVocabTypeSelect}
          onClose={() => setContextMenu(null)}
        />
      )}

      {vocabForm && (
        <VocabAddForm
          x={vocabForm.x}
          y={vocabForm.y}
          selectedText={vocabForm.selectedText}
          vocabType={vocabForm.vocabType}
          isDuplicate={vocabForm.isDuplicate}
          onAdd={handleVocabAdd}
          onClose={() => setVocabForm(null)}
        />
      )}

      {tts.ttsOpen && (
        <div className="tts-panel">
          {/* ── Engine toggle ── */}
          <div className="tts-panel__engine-row">
            {(['supertone', 'piper', 'kokoro', 'qwen'] as const).map(engine => (
              <button
                key={engine}
                className={`tts-panel__engine-btn ${ttsSettings.engine === engine ? 'tts-panel__engine-btn--active' : ''}`}
                onClick={() => tts.setEngine(engine)}
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
                      className={`tts-panel__chip ${tts.kokoroVoice === v.id ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => tts.setKokoroVoice(v.id)}
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
                  onChange={e => tts.setTtsSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
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
                      onClick={() => tts.setTtsSettings(s => ({ ...s, voice: v }))}
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
                      onClick={() => tts.setTtsSettings(s => ({ ...s, lang: l }))}
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
                  onChange={e => tts.setTtsSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
                  className="tts-panel__slider"
                />
              </label>

              <label className="tts-panel__label">
                <span>Quality steps</span>
                <span className="tts-panel__value">{ttsSettings.totalSteps}</span>
                <input
                  type="range" min="1" max="20" step="1"
                  value={ttsSettings.totalSteps}
                  onChange={e => tts.setTtsSettings(s => ({ ...s, totalSteps: parseInt(e.target.value) }))}
                  className="tts-panel__slider"
                />
              </label>
            </div>

          ) : ttsSettings.engine === 'qwen' ? (
            /* ── Qwen CustomVoice settings ── */
            <div className="tts-panel__settings">
              <div className="tts-panel__row">
                <label className="tts-panel__field-label">Speaker</label>
                <div className="tts-panel__chips tts-panel__chips--wrap">
                  {QWEN_TTS_SPEAKERS.map(v => (
                    <button
                      key={v.id}
                      className={`tts-panel__chip ${ttsSettings.speaker === v.id ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => tts.setTtsSettings(s => ({ ...s, speaker: v.id }))}
                      title={`${v.lang} — ${v.id}`}
                    >
                      <span className="tts-panel__chip-label">{v.label}</span>
                      <span className="tts-panel__chip-lang">{v.lang}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="tts-panel__row">
                <label className="tts-panel__field-label">Language</label>
                <div className="tts-panel__chips">
                  {QWEN_TTS_LANGS.map(lang => (
                    <button
                      key={lang}
                      className={`tts-panel__chip ${ttsSettings.lang === lang ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => tts.setTtsSettings(s => ({ ...s, lang }))}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tts-panel__row">
                <label className="tts-panel__field-label" htmlFor="qwen-instruct">
                  Instruct
                </label>
                <input
                  id="qwen-instruct"
                  className="tts-panel__voice-input"
                  type="text"
                  value={ttsSettings.instruct}
                  onChange={e => tts.setTtsSettings(s => ({ ...s, instruct: e.target.value }))}
                  placeholder="Optional speaking style or emotion"
                  spellCheck={false}
                />
              </div>

              <p className="tts-panel__hint">
                Runs Qwen3-TTS 1.7B CustomVoice on the local GPU.
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
                      className={`tts-panel__chip ${tts.piperVoice === v.id ? 'tts-panel__chip--active' : ''}`}
                      onClick={() => tts.setPiperVoice(v.id)}
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
                  value={tts.piperVoice}
                  onChange={e => tts.setPiperVoice(e.target.value)}
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
                  onChange={e => tts.setTtsSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
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

          {tts.audioUrl && (
            <div className="tts-panel__player">
              <div className="tts-panel__player-main">
                <audio ref={tts.audioRef} controls src={tts.audioUrl} className="tts-panel__audio" />
                <a
                  href={tts.audioUrl}
                  download={tts.audioFilename}
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
                    className={`tts-panel__rate-btn ${tts.playbackRate === r ? 'tts-panel__rate-btn--active' : ''}`}
                    onClick={() => tts.setPlaybackRate(r)}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="tts-panel__footer">
            {tts.ttsError && <span className="tts-panel__error">{tts.ttsError}</span>}
            <button
              className="btn btn--primary tts-panel__generate"
              onClick={() => void tts.handleGenerate()}
              disabled={tts.ttsStatus === 'loading' || !activeContent.trim()}
            >
              {tts.ttsStatus === 'loading' ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
