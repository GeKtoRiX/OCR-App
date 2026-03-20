export interface HealthCheckOutput {
  paddleOcrReachable: boolean;
  paddleOcrModels: string[];
  paddleOcrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
  superToneReachable: boolean;
  kokoroReachable: boolean;
  qwenTtsReachable: boolean;
  qwenTtsDevice: 'gpu' | 'cpu' | null;
}
