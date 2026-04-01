import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TtsSettingsPanel } from './TtsSettingsPanel';
import type { TtsState } from '../features/tts';

function createTtsState(overrides: Partial<TtsState> = {}): TtsState {
  return {
    ttsOpen: true,
    setTtsOpen: vi.fn(),
    ttsSettings: {
      engine: 'kokoro',
      voice: 'af_heart',
      speed: 1,
    },
    setTtsSettings: vi.fn(),
    setEngine: vi.fn(),
    piperVoice: 'en_US-ryan-high',
    setPiperVoice: vi.fn(),
    kokoroVoice: 'af_heart',
    setKokoroVoice: vi.fn(),
    ttsStatus: 'idle',
    ttsError: null,
    audioUrl: null,
    audioFilename: 'sample.wav',
    audioRef: { current: null },
    playbackRate: 1,
    setPlaybackRate: vi.fn(),
    canGenerate: true,
    handleGenerate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('TtsSettingsPanel', () => {
  it('falls back to the first allowed engine when the current engine is unavailable', () => {
    const tts = createTtsState({
      ttsSettings: {
        engine: 'supertone',
        voice: 'M1',
        lang: 'en',
        speed: 1.05,
        totalSteps: 5,
      },
    });

    render(<TtsSettingsPanel tts={tts} engines={['piper', 'kokoro']} />);

    expect(tts.setEngine).toHaveBeenCalledWith('piper');
  });

  it('renders kokoro controls and updates the selected voice and speed', () => {
    const tts = createTtsState();

    const { container } = render(<TtsSettingsPanel tts={tts} />);

    fireEvent.click(screen.getByRole('button', { name: /bella/i }));
    expect(tts.setKokoroVoice).toHaveBeenCalledWith('af_bella');

    fireEvent.change(container.querySelector('input[type="range"]')!, {
      target: { value: '1.35' },
    });
    expect(tts.setTtsSettings).toHaveBeenCalled();
  });

  it('renders supertone controls and updates language, voice, speed, and quality steps', () => {
    const tts = createTtsState({
      ttsSettings: {
        engine: 'supertone',
        voice: 'M1',
        lang: 'en',
        speed: 1.05,
        totalSteps: 5,
      },
    });

    const { container } = render(<TtsSettingsPanel tts={tts} />);

    fireEvent.click(screen.getByRole('button', { name: 'F1' }));
    fireEvent.click(screen.getByRole('button', { name: 'FR' }));
    const sliders = container.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[0]!, { target: { value: '1.5' } });
    fireEvent.change(sliders[1]!, { target: { value: '9' } });

    const updaters = vi.mocked(tts.setTtsSettings).mock.calls.map(([update]) => update);
    expect(updaters).toHaveLength(4);

    expect(
      (updaters[0] as (state: TtsState['ttsSettings']) => TtsState['ttsSettings'])({
        engine: 'supertone',
        voice: 'M1',
        lang: 'en',
        speed: 1.05,
        totalSteps: 5,
      }),
    ).toEqual({
      engine: 'supertone',
      voice: 'F1',
      lang: 'en',
      speed: 1.05,
      totalSteps: 5,
    });

    expect(
      (updaters[1] as (state: TtsState['ttsSettings']) => TtsState['ttsSettings'])({
        engine: 'supertone',
        voice: 'M1',
        lang: 'en',
        speed: 1.05,
        totalSteps: 5,
      }),
    ).toEqual({
      engine: 'supertone',
      voice: 'M1',
      lang: 'fr',
      speed: 1.05,
      totalSteps: 5,
    });

    expect(typeof updaters[2]).toBe('function');
    expect(typeof updaters[3]).toBe('function');
  });

  it('renders piper controls, playback controls, and disabled generate state', () => {
    const tts = createTtsState({
      ttsSettings: {
        engine: 'piper',
        voice: 'en_US-ryan-high',
        speed: 1.05,
      },
      audioUrl: 'blob:audio',
      canGenerate: false,
      ttsError: 'service unavailable',
      playbackRate: 1.25,
    });

    render(<TtsSettingsPanel tts={tts} />);

    fireEvent.click(screen.getByRole('button', { name: /amy/i }));
    expect(tts.setPiperVoice).toHaveBeenCalledWith('en_US-amy-medium');

    fireEvent.change(screen.getByPlaceholderText('e.g. en_US-amy-medium'), {
      target: { value: 'custom-voice' },
    });
    expect(tts.setPiperVoice).toHaveBeenCalledWith('custom-voice');

    fireEvent.click(screen.getByRole('button', { name: '2×' }));
    expect(tts.setPlaybackRate).toHaveBeenCalledWith(2);

    expect(screen.getByTestId('tts-audio-player')).toHaveAttribute('src', 'blob:audio');
    expect(screen.getByRole('link', { name: /wav/i })).toHaveAttribute('download', 'sample.wav');
    expect(screen.getByText('service unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('tts-generate-button')).toBeDisabled();
  });
});
