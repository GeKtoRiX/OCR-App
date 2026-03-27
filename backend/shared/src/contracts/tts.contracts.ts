export const TTS_PATTERNS = {
  SYNTHESIZE: 'tts.synthesize',
  CHECK_HEALTH: 'tts.check_health',
} as const;

export interface TtsSynthesizePayload {
  text: string;
  engine?: string;
  voice?: string;
  format?: 'wav';
  lang?: string;
  speed?: number;
  totalSteps?: number;
  refText?: string;
  refAudioBase64?: string;
  refAudioFilename?: string;
  refAudioMimeType?: string;
  autoTranscribe?: boolean;
  removeSilence?: boolean;
}

export interface TtsSynthesizeResponse {
  audioBase64: string;
  contentType: 'audio/wav';
  filename: string;
}

export interface TtsHealthPayload {}

export interface TtsHealthResponse {
  superToneReachable: boolean;
  kokoroReachable: boolean;
  f5TtsReachable: boolean;
  f5TtsDevice: 'gpu' | 'cpu' | null;
  voxtralReachable: boolean;
  voxtralDevice: 'gpu' | 'cpu' | null;
}
