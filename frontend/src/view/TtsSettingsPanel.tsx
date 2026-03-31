import { useEffect } from 'react';
import type { TtsState } from '../features/tts';
import {
  TTS_VOICES,
  TTS_LANGS,
  TTS_LANG_LABELS,
  PIPER_VOICES,
  KOKORO_VOICES,
  type TtsEngine,
} from '../shared/types';
import './TtsPanel.css';

const ALL_ENGINES = ['supertone', 'kokoro'] as const;

interface Props {
  tts: TtsState;
  engines?: readonly TtsEngine[];
}

export function TtsSettingsPanel({ tts, engines = ALL_ENGINES }: Props) {
  const { ttsSettings } = tts;

  useEffect(() => {
    if (!engines.includes(ttsSettings.engine)) {
      tts.setEngine(engines[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engines]);

  return (
    <div className="tts-panel">
      <div className="tts-panel__engine-row">
        {engines.map((engine) => (
          <button
            key={engine}
            className={`tts-panel__engine-btn ${ttsSettings.engine === engine ? 'tts-panel__engine-btn--active' : ''}`}
            onClick={() => tts.setEngine(engine)}
            data-testid={`tts-engine-${engine}`}
          >
            {engine.charAt(0).toUpperCase() + engine.slice(1)}
          </button>
        ))}
      </div>

      {ttsSettings.engine === 'kokoro' ? (
        <div className="tts-panel__settings">
          <div className="tts-panel__row">
            <label className="tts-panel__field-label">Voice</label>
            <div className="tts-panel__chips tts-panel__chips--wrap">
              {KOKORO_VOICES.map((voice) => (
                <button
                  key={voice.id}
                  className={`tts-panel__chip ${tts.kokoroVoice === voice.id ? 'tts-panel__chip--active' : ''}`}
                  onClick={() => tts.setKokoroVoice(voice.id)}
                  title={`${voice.lang} — ${voice.id}`}
                >
                  <span className="tts-panel__chip-label">{voice.label}</span>
                  <span className="tts-panel__chip-lang">{voice.lang}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="tts-panel__label">
            <span>Speed</span>
            <span className="tts-panel__value">{ttsSettings.speed.toFixed(2)}×</span>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={ttsSettings.speed}
              onChange={(e) =>
                tts.setTtsSettings((settings) => ({ ...settings, speed: parseFloat(e.target.value) }))
              }
              className="tts-panel__slider"
            />
          </label>
        </div>
      ) : ttsSettings.engine === 'supertone' ? (
        <div className="tts-panel__settings">
          <div className="tts-panel__row">
            <label className="tts-panel__field-label">Voice</label>
            <div className="tts-panel__chips">
              {TTS_VOICES.map((voice) => (
                <button
                  key={voice}
                  className={`tts-panel__chip ${ttsSettings.voice === voice ? 'tts-panel__chip--active' : ''}`}
                  onClick={() => tts.setTtsSettings((settings) => ({ ...settings, voice }))}
                >
                  {voice}
                </button>
              ))}
            </div>
          </div>

          <div className="tts-panel__row">
            <label className="tts-panel__field-label">Language</label>
            <div className="tts-panel__chips">
              {TTS_LANGS.map((lang) => (
                <button
                  key={lang}
                  className={`tts-panel__chip ${ttsSettings.lang === lang ? 'tts-panel__chip--active' : ''}`}
                  onClick={() => tts.setTtsSettings((settings) => ({ ...settings, lang }))}
                  title={TTS_LANG_LABELS[lang]}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <label className="tts-panel__label">
            <span>Speed</span>
            <span className="tts-panel__value">{ttsSettings.speed.toFixed(2)}×</span>
            <input
              type="range"
              min="0.7"
              max="2.0"
              step="0.05"
              value={ttsSettings.speed}
              onChange={(e) =>
                tts.setTtsSettings((settings) => ({ ...settings, speed: parseFloat(e.target.value) }))
              }
              className="tts-panel__slider"
            />
          </label>

          <label className="tts-panel__label">
            <span>Quality steps</span>
            <span className="tts-panel__value">{ttsSettings.totalSteps}</span>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={ttsSettings.totalSteps}
              onChange={(e) =>
                tts.setTtsSettings((settings) => ({
                  ...settings,
                  totalSteps: parseInt(e.target.value),
                }))
              }
              className="tts-panel__slider"
            />
          </label>
        </div>
      ) : ttsSettings.engine === 'piper' ? (
        <div className="tts-panel__settings">
          <div className="tts-panel__row">
            <label className="tts-panel__field-label">Voice</label>
            <div className="tts-panel__chips tts-panel__chips--wrap">
              {PIPER_VOICES.map((voice) => (
                <button
                  key={voice.id}
                  className={`tts-panel__chip ${tts.piperVoice === voice.id ? 'tts-panel__chip--active' : ''}`}
                  onClick={() => tts.setPiperVoice(voice.id)}
                  title={`${voice.lang} — ${voice.id}`}
                >
                  <span className="tts-panel__chip-label">{voice.label}</span>
                  <span className="tts-panel__chip-lang">{voice.lang}</span>
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
              onChange={(e) => tts.setPiperVoice(e.target.value)}
              placeholder="e.g. en_US-amy-medium"
              spellCheck={false}
            />
          </div>

          <label className="tts-panel__label">
            <span>Speed</span>
            <span className="tts-panel__value">{ttsSettings.speed.toFixed(2)}×</span>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={ttsSettings.speed}
              onChange={(e) =>
                tts.setTtsSettings((settings) => ({ ...settings, speed: parseFloat(e.target.value) }))
              }
              className="tts-panel__slider"
            />
          </label>

          <p className="tts-panel__hint">
            First use downloads the voice model (~30-100 MB). Full list:{' '}
            <a href="https://rhasspy.github.io/piper-samples/" target="_blank" rel="noreferrer">
              piper-samples
            </a>
          </p>
        </div>
      ) : null}

      {tts.audioUrl && (
        <div className="tts-panel__player">
          <div className="tts-panel__player-main">
            <audio
              ref={tts.audioRef}
              controls
              src={tts.audioUrl}
              className="tts-panel__audio"
              data-testid="tts-audio-player"
            />
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
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <button
                key={rate}
                className={`tts-panel__rate-btn ${tts.playbackRate === rate ? 'tts-panel__rate-btn--active' : ''}`}
                onClick={() => tts.setPlaybackRate(rate)}
              >
                {rate}×
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
          disabled={tts.ttsStatus === 'loading' || !tts.canGenerate}
          data-testid="tts-generate-button"
        >
          {tts.ttsStatus === 'loading' ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}
