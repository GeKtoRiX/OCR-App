export const TTS_PATTERNS = {
  SYNTHESIZE: 'tts.synthesize',
  CHECK_HEALTH: 'tts.check_health',
} as const;

export interface TtsSynthesizePayload {
  text: string;
  engine?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  totalSteps?: number;
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
}
