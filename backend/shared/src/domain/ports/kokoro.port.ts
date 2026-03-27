export interface KokoroSynthesisInput {
  text: string;
  voice?: string;
  speed?: number;
  lang?: string;
}

export abstract class IKokoroPort {
  abstract synthesize(input: KokoroSynthesisInput): Promise<Buffer>;
  abstract checkHealth(): Promise<boolean>;
}
