import { useState, useCallback, useEffect, useRef } from 'react';
import type { TtsSettings, TtsEngine } from '../../shared/types';
import { generateSpeech } from '../../shared/api';
import { toErrorMessage } from '../../shared/lib/errors';

const DEFAULT_SETTINGS: TtsSettings = {
  engine: 'supertone',
  voice: 'M1',
  lang: 'en',
  speed: 1.05,
  totalSteps: 5,
};

const DEFAULT_PIPER_VOICE  = 'en_US-ryan-high';
const DEFAULT_KOKORO_VOICE = 'af_heart';
const DEFAULT_VOXTRAL_VOICE = 'casual_female';

export interface TtsState {
  ttsOpen: boolean;
  setTtsOpen: React.Dispatch<React.SetStateAction<boolean>>;

  ttsSettings: TtsSettings;
  setTtsSettings: React.Dispatch<React.SetStateAction<TtsSettings>>;
  setEngine: (engine: TtsEngine) => void;

  piperVoice: string;
  setPiperVoice: React.Dispatch<React.SetStateAction<string>>;
  kokoroVoice: string;
  setKokoroVoice: React.Dispatch<React.SetStateAction<string>>;
  voxtralVoice: string;
  setVoxtralVoice: React.Dispatch<React.SetStateAction<string>>;

  ttsStatus: 'idle' | 'loading' | 'error';
  ttsError: string | null;

  audioUrl: string | null;
  audioFilename: string;
  audioRef: React.RefObject<HTMLAudioElement>;

  playbackRate: number;
  setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;
  canGenerate: boolean;

  handleGenerate: () => Promise<void>;
}

/**
 * Manages all TTS state and side-effects for a given text content and filename.
 * Keeps ResultPanel.tsx a pure view component.
 * @param disabled - when true, canGenerate is forced to false (e.g. while editing)
 */
export function useTts(activeContent: string, filename: string, disabled = false): TtsState {
  const [ttsOpen, setTtsOpen]       = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(DEFAULT_SETTINGS);
  const [piperVoice, setPiperVoice]   = useState(DEFAULT_PIPER_VOICE);
  const [kokoroVoice, setKokoroVoice] = useState(DEFAULT_KOKORO_VOICE);
  const [voxtralVoice, setVoxtralVoice] = useState(DEFAULT_VOXTRAL_VOICE);
  const [ttsStatus, setTtsStatus]     = useState<'idle' | 'loading' | 'error'>('idle');
  const [ttsError, setTtsError]       = useState<string | null>(null);
  const [audioUrl, setAudioUrl]       = useState<string | null>(null);
  const [audioFilename, setAudioFilename] = useState('');
  const [playbackRate, setPlaybackRate]   = useState(1);

  const audioUrlRef = useRef<string | null>(null);
  const audioRef    = useRef<HTMLAudioElement>(null);

  // Keep ref in sync for cleanup
  useEffect(() => { audioUrlRef.current = audioUrl; }, [audioUrl]);

  // Revoke blob URL on unmount
  useEffect(() => () => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  // Apply playback rate to the audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const setEngine = (engine: TtsEngine) => {
    if (engine === 'supertone') {
      setTtsSettings({ engine: 'supertone', voice: 'M1', lang: 'en', speed: 1.05, totalSteps: 5 });
    } else if (engine === 'piper') {
      setTtsSettings({ engine: 'piper', voice: piperVoice, speed: 1.05 });
    } else if (engine === 'kokoro') {
      setTtsSettings({ engine: 'kokoro', voice: kokoroVoice, speed: 1.0 });
    } else if (engine === 'f5') {
      setTtsSettings({
        engine: 'f5',
        refText: '',
        refAudioFile: null,
        autoTranscribe: false,
        removeSilence: false,
      });
    } else if (engine === 'voxtral') {
      setTtsSettings({
        engine: 'voxtral',
        voice: voxtralVoice,
        format: 'wav',
      });
    }
  };

  const handleGenerate = useCallback(async () => {
    setTtsStatus('loading');
    setTtsError(null);

    // piperVoice / kokoroVoice are kept as separate state since they persist
    // across engine switches; sync them into settings before sending.
    let settingsToUse: TtsSettings = ttsSettings;
    if (ttsSettings.engine === 'piper') {
      settingsToUse = { ...ttsSettings, voice: piperVoice };
    } else if (ttsSettings.engine === 'kokoro') {
      settingsToUse = { ...ttsSettings, voice: kokoroVoice };
    } else if (ttsSettings.engine === 'voxtral') {
      settingsToUse = { ...ttsSettings, voice: voxtralVoice };
    } else if (
      ttsSettings.engine === 'f5' &&
      ((!ttsSettings.autoTranscribe && !ttsSettings.refText.trim()) || !ttsSettings.refAudioFile)
    ) {
      setTtsError(
        ttsSettings.autoTranscribe
          ? 'F5 TTS requires reference audio'
          : 'F5 TTS requires reference audio and reference text',
      );
      setTtsStatus('error');
      return;
    }

    if (settingsToUse.engine === 'kokoro' && /[\u0400-\u04FF]/.test(activeContent)) {
      setTtsError(
        'Kokoro in this stack supports English voices only. Use another TTS engine for Cyrillic text.',
      );
      setTtsStatus('error');
      return;
    }

    try {
      const blob = await generateSpeech(activeContent, settingsToUse);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setAudioFilename(`${filename.replace(/\.[^.]+$/, '')}_speech.wav`);
      setTtsStatus('idle');
    } catch (e) {
      setTtsError(toErrorMessage(e, 'TTS failed'));
      setTtsStatus('error');
    }
  }, [activeContent, ttsSettings, piperVoice, kokoroVoice, voxtralVoice, filename]);

  const canGenerate =
    !disabled &&
    activeContent.trim().length > 0 &&
    (ttsSettings.engine !== 'f5' ||
      (((ttsSettings.autoTranscribe || ttsSettings.refText.trim().length > 0)) &&
        ttsSettings.refAudioFile !== null));

  return {
    ttsOpen, setTtsOpen,
    ttsSettings, setTtsSettings, setEngine,
    piperVoice, setPiperVoice,
    kokoroVoice, setKokoroVoice,
    voxtralVoice, setVoxtralVoice,
    ttsStatus, ttsError,
    audioUrl, audioFilename, audioRef,
    playbackRate, setPlaybackRate,
    canGenerate,
    handleGenerate,
  };
}
