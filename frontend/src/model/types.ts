export interface OcrResponse {
  rawText: string;
  markdown: string;
  filename: string;
}

export interface HealthResponse {
  paddleOcrReachable: boolean;
  paddleOcrModels: string[];
  paddleOcrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
}

export interface ApiError {
  statusCode: number;
  message: string;
}
