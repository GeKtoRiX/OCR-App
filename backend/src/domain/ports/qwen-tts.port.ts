export interface QwenSynthesisInput {
  text: string;
  lang?: string;
  speaker?: string;
  instruct?: string;
}

export interface QwenTtsHealthResult {
  reachable: boolean;
  device: 'gpu' | 'cpu' | null;
}

export abstract class IQwenTtsPort {
  abstract synthesize(input: QwenSynthesisInput): Promise<Buffer>;
  abstract getHealth(): Promise<QwenTtsHealthResult>;
}
