import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTts } from './useTts';

vi.mock('../../shared/api', () => ({
  generateSpeech: vi.fn(),
}));

import { generateSpeech } from '../../shared/api';

const mockGenerateSpeech = vi.mocked(generateSpeech);

describe('useTts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:audio-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should have correct default state', () => {
    const { result } = renderHook(() => useTts('content', 'test.png'));

    expect(result.current.ttsOpen).toBe(false);
    expect(result.current.ttsSettings).toEqual({
      engine: 'supertone',
      voice: 'M1',
      lang: 'en',
      speed: 1.05,
      totalSteps: 5,
    });
    expect(result.current.ttsStatus).toBe('idle');
    expect(result.current.ttsError).toBeNull();
    expect(result.current.audioUrl).toBeNull();
  });

  describe('handleGenerate — success', () => {
    it('should create a blob URL and set audioUrl', async () => {
      const blob = new Blob(['wav'], { type: 'audio/wav' });
      mockGenerateSpeech.mockResolvedValue(blob);

      const { result } = renderHook(() => useTts('hello', 'invoice.png'));

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.ttsStatus).toBe('idle');
      expect(result.current.audioUrl).toBe('blob:audio-url');
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });

    it('should set audioFilename derived from the source filename', async () => {
      mockGenerateSpeech.mockResolvedValue(new Blob());

      const { result } = renderHook(() => useTts('text', 'invoice.png'));

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.audioFilename).toBe('invoice_speech.wav');
    });

    it('should pass activeContent and settings to generateSpeech', async () => {
      mockGenerateSpeech.mockResolvedValue(new Blob());

      const { result } = renderHook(() => useTts('my text', 'file.png'));

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(mockGenerateSpeech).toHaveBeenCalledWith(
        'my text',
        expect.objectContaining({ engine: 'supertone', voice: 'M1' }),
      );
    });

    it('should revoke previous blob URL on re-generation', async () => {
      mockGenerateSpeech.mockResolvedValue(new Blob());

      const { result } = renderHook(() => useTts('text', 'file.png'));

      await act(async () => {
        await result.current.handleGenerate();
      });
      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio-url');
    });
  });

  describe('handleGenerate — error', () => {
    it('should set ttsStatus=error and ttsError on failure', async () => {
      mockGenerateSpeech.mockRejectedValue(new Error('TTS sidecar unreachable'));

      const { result } = renderHook(() => useTts('text', 'file.png'));

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.ttsStatus).toBe('error');
      expect(result.current.ttsError).toBe('TTS sidecar unreachable');
      expect(result.current.audioUrl).toBeNull();
    });

    it('should handle non-Error rejections', async () => {
      mockGenerateSpeech.mockRejectedValue('string error');

      const { result } = renderHook(() => useTts('text', 'file.png'));

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.ttsStatus).toBe('error');
      expect(result.current.ttsError).toBe('TTS failed');
    });
  });

  describe('setEngine', () => {
    it('should switch to supertone defaults', () => {
      const { result } = renderHook(() => useTts('text', 'file.png'));

      act(() => { result.current.setEngine('supertone'); });

      expect(result.current.ttsSettings).toEqual({
        engine: 'supertone',
        voice: 'M1',
        lang: 'en',
        speed: 1.05,
        totalSteps: 5,
      });
    });

    it('should switch to piper with default piper voice', () => {
      const { result } = renderHook(() => useTts('text', 'file.png'));

      act(() => { result.current.setEngine('piper'); });

      expect(result.current.ttsSettings.engine).toBe('piper');
      expect(result.current.ttsSettings.voice).toBe(result.current.piperVoice);
    });

    it('should switch to kokoro with default kokoro voice', () => {
      const { result } = renderHook(() => useTts('text', 'file.png'));

      act(() => { result.current.setEngine('kokoro'); });

      expect(result.current.ttsSettings.engine).toBe('kokoro');
      expect(result.current.ttsSettings.voice).toBe(result.current.kokoroVoice);
    });

    it('should switch to f5 with reference voice defaults', () => {
      const { result } = renderHook(() => useTts('text', 'file.png'));

      act(() => { result.current.setEngine('f5'); });

      expect(result.current.ttsSettings).toEqual({
        engine: 'f5',
        refText: '',
        refAudioFile: null,
        autoTranscribe: false,
        removeSilence: false,
      });
    });

    it('should switch to voxtral with preset voice defaults', () => {
      const { result } = renderHook(() => useTts('text', 'file.png'));

      act(() => { result.current.setEngine('voxtral'); });

      expect(result.current.ttsSettings).toEqual({
        engine: 'voxtral',
        voice: 'casual_female',
        format: 'wav',
      });
    });
  });

  it('should sync custom piperVoice into settings for the API call', async () => {
    mockGenerateSpeech.mockResolvedValue(new Blob());

    const { result } = renderHook(() => useTts('text', 'file.png'));

    act(() => {
      result.current.setEngine('piper');
      result.current.setPiperVoice('en_US-amy-medium');
    });

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockGenerateSpeech).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({ engine: 'piper', voice: 'en_US-amy-medium' }),
    );
  });

  it('should sync custom kokoroVoice into settings for the API call', async () => {
    mockGenerateSpeech.mockResolvedValue(new Blob());

    const { result } = renderHook(() => useTts('text', 'file.png'));

    act(() => {
      result.current.setEngine('kokoro');
      result.current.setKokoroVoice('bm_fable');
    });

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockGenerateSpeech).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({ engine: 'kokoro', voice: 'bm_fable' }),
    );
  });

  it('should send f5 settings to the API call', async () => {
    mockGenerateSpeech.mockResolvedValue(new Blob());
    const refAudioFile = new File(['wav'], 'reference.wav', { type: 'audio/wav' });

    const { result } = renderHook(() => useTts('text', 'file.png'));

    act(() => {
      result.current.setEngine('f5');
      result.current.setTtsSettings({
        engine: 'f5',
        refText: 'Reference text',
        refAudioFile,
        autoTranscribe: false,
        removeSilence: true,
      });
    });

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockGenerateSpeech).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({
        engine: 'f5',
        refText: 'Reference text',
        refAudioFile,
        autoTranscribe: false,
        removeSilence: true,
      }),
    );
  });

  it('should sync voxtralVoice into settings for the API call', async () => {
    mockGenerateSpeech.mockResolvedValue(new Blob());

    const { result } = renderHook(() => useTts('text', 'file.png'));

    act(() => {
      result.current.setEngine('voxtral');
      result.current.setVoxtralVoice('casual_male');
    });

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockGenerateSpeech).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({
        engine: 'voxtral',
        voice: 'casual_male',
        format: 'wav',
      }),
    );
  });

  it('should disable f5 generation until required fields are provided', () => {
    const { result } = renderHook(() => useTts('text', 'file.png'));

    act(() => { result.current.setEngine('f5'); });
    expect(result.current.canGenerate).toBe(false);

    act(() => {
      result.current.setTtsSettings({
        engine: 'f5',
        refText: 'Reference text',
        refAudioFile: new File(['wav'], 'reference.wav', { type: 'audio/wav' }),
        autoTranscribe: false,
        removeSilence: false,
      });
    });

    expect(result.current.canGenerate).toBe(true);
  });

  it('should allow f5 generation with autoTranscribe and no refText', () => {
    const { result } = renderHook(() => useTts('text', 'file.png'));

    act(() => {
      result.current.setEngine('f5');
      result.current.setTtsSettings({
        engine: 'f5',
        refText: '',
        refAudioFile: new File(['wav'], 'reference.wav', { type: 'audio/wav' }),
        autoTranscribe: true,
        removeSilence: false,
      });
    });

    expect(result.current.canGenerate).toBe(true);
  });

  it('should allow voxtral generation without reference audio', () => {
    const { result } = renderHook(() => useTts('text', 'file.png'));

    act(() => {
      result.current.setEngine('voxtral');
    });

    expect(result.current.canGenerate).toBe(true);
  });

  it('should revoke blob URL on unmount', async () => {
    mockGenerateSpeech.mockResolvedValue(new Blob());

    const { result, unmount } = renderHook(() => useTts('text', 'file.png'));

    await act(async () => {
      await result.current.handleGenerate();
    });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio-url');
  });
});
