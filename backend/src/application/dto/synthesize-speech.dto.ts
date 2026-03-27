import type { UploadedFile } from '../../domain/value-objects/uploaded-file.vo';

export interface SynthesizeSpeechInput {
  text: string;
  engine?: string;
  voice?: string;
  format?: 'wav';
  lang?: string;
  speed?: number;
  totalSteps?: number;
  refText?: string;
  refAudio?: UploadedFile;
  autoTranscribe?: boolean;
  removeSilence?: boolean;
}

export interface SynthesizeSpeechOutput {
  wav: Buffer;
}
