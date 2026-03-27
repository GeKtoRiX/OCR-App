export interface SupertoneSynthesisInput {
  text: string;
  engine?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  totalSteps?: number;
}

export abstract class ISupertonePort {
  abstract synthesize(input: SupertoneSynthesisInput): Promise<Buffer>;
  abstract checkHealth(): Promise<boolean>;
}
