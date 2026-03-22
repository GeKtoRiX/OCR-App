import type { UploadedFile } from '../value-objects/uploaded-file.vo';

export interface F5SynthesisInput {
  text: string;
  refText?: string;
  refAudio: UploadedFile;
  autoTranscribe?: boolean;
  removeSilence?: boolean;
}

export interface F5TtsHealthResult {
  reachable: boolean;
  device: 'gpu' | 'cpu' | null;
}

export abstract class IF5TtsPort {
  abstract synthesize(input: F5SynthesisInput): Promise<Buffer>;
  abstract getHealth(): Promise<F5TtsHealthResult>;
}
