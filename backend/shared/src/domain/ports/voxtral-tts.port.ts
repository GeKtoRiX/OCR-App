export interface VoxtralSynthesisInput {
  text: string;
  voice?: string;
  format?: 'wav';
}

export interface VoxtralTtsHealthResult {
  reachable: boolean;
  device: 'gpu' | 'cpu' | null;
}

export abstract class IVoxtralTtsPort {
  abstract synthesize(input: VoxtralSynthesisInput): Promise<Buffer>;
  abstract getHealth(): Promise<VoxtralTtsHealthResult>;
}
