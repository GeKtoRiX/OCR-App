export class OcrResponseDto {
  rawText!: string;
  markdown!: string;
  filename!: string;
}

export class HealthResponseDto {
  paddleOcrReachable!: boolean;
  paddleOcrModels!: string[];
  paddleOcrDevice!: 'gpu' | 'cpu' | null;
  lmStudioReachable!: boolean;
  lmStudioModels!: string[];
  superToneReachable!: boolean;
  kokoroReachable!: boolean;
  f5TtsReachable!: boolean;
  f5TtsDevice!: 'gpu' | 'cpu' | null;
}
