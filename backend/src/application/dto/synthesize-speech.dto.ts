export interface SynthesizeSpeechInput {
  text: string;
  engine?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  totalSteps?: number;
  speaker?: string;
  instruct?: string;
}

export interface SynthesizeSpeechOutput {
  wav: Buffer;
}
