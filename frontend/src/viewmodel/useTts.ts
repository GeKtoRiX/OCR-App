import { useState, useCallback, useEffect, useRef } from 'react';
import type { TtsSettings, TtsEngine } from '../model/types';
import { generateSpeech } from '../model/api';

const DEFAULT_SETTINGS: TtsSettings = {
  engine: 'supertone',
  voice: 'M1',
  lang: 'en',
  speed: 1.05,
  totalSteps: 5,
};

const DEFAULT_PIPER_VOICE  = 'en_US-ryan-high';
const DEFAULT_KOKORO_VOICE = 'af_heart';
const DEFAULT_QWEN_SPEAKER  = 'Ryan';
const DEFAULT_QWEN_LANG     = 'English';

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

  ttsStatus: 'idle' | 'loading' | 'error';
  ttsError: string | null;

  audioUrl: string | null;
  audioFilename: string;
  audioRef: React.RefObject<HTMLAudioElement>;

  playbackRate: number;
  setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;

  handleGenerate: () => Promise<void>;
}

/**
 * Manages all TTS state and side-effects for a given text content and filename.
 * Keeps ResultPanel.tsx a pure view component.
 */
export function useTts(activeContent: string, filename: string): TtsState {
  const [ttsOpen, setTtsOpen]       = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(DEFAULT_SETTINGS);
  const [piperVoice, setPiperVoice]   = useState(DEFAULT_PIPER_VOICE);
  const [kokoroVoice, setKokoroVoice] = useState(DEFAULT_KOKORO_VOICE);
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
    } else if (engine === 'qwen') {
      setTtsSettings({
        engine: 'qwen',
        lang: DEFAULT_QWEN_LANG,
        speaker: DEFAULT_QWEN_SPEAKER,
        instruct: '',
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
    }

    try {
      const blob = await generateSpeech(activeContent, settingsToUse);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setAudioFilename(`${filename.replace(/\.[^.]+$/, '')}_speech.wav`);
      setTtsStatus('idle');
    } catch (e) {
      setTtsError(e instanceof Error ? e.message : 'TTS failed');
      setTtsStatus('error');
    }
  }, [activeContent, ttsSettings, piperVoice, kokoroVoice, filename]);

  return {
    ttsOpen, setTtsOpen,
    ttsSettings, setTtsSettings, setEngine,
    piperVoice, setPiperVoice,
    kokoroVoice, setKokoroVoice,
    ttsStatus, ttsError,
    audioUrl, audioFilename, audioRef,
    playbackRate, setPlaybackRate,
    handleGenerate,
  };
}
