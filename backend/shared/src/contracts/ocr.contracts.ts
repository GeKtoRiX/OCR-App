export const OCR_PATTERNS = {
  PROCESS_IMAGE: 'ocr.process_image',
  CHECK_HEALTH: 'ocr.check_health',
} as const;

export interface ProcessImagePayload {
  base64: string;
  mimeType: string;
  filename: string;
}

export interface ProcessImageResponse {
  rawText: string;
  markdown: string;
  filename: string;
}

export interface OcrHealthPayload {}

export interface OcrHealthResponse {
  paddleOcrReachable: boolean;
  paddleOcrModels: string[];
  paddleOcrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
}
