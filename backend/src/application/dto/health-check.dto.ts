export interface HealthCheckOutput {
  ocrReachable: boolean;
  ocrModels: string[];
  ocrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
  superToneReachable: boolean;
  kokoroReachable: boolean;
  f5TtsReachable: boolean;
  f5TtsDevice: 'gpu' | 'cpu' | null;
  voxtralReachable: boolean;
  voxtralDevice: 'gpu' | 'cpu' | null;
}
