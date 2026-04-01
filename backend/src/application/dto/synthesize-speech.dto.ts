export interface SynthesizeSpeechInput {
  text: string;
  engine?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  totalSteps?: number;
}

export interface SynthesizeSpeechOutput {
  wav: Buffer;
}
