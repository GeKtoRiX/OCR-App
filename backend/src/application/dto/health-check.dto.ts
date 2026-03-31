export interface HealthCheckOutput {
  ocrReachable: boolean;
  ocrModels: string[];
  ocrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
  superToneReachable: boolean;
  kokoroReachable: boolean;
}
