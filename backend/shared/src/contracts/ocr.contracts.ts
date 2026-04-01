export const OCR_PATTERNS = {
  PROCESS_IMAGE: 'ocr.process_image',
  CHECK_HEALTH: 'ocr.check_health',
} as const;

export interface ProcessImagePayload {
  base64: string;
  mimeType: string;
  filename: string;
}

export interface OcrLine {
  text: string;
  bbox: number[];
  confidence?: number;
}

export interface OcrBlock {
  type: string;
  bbox: number[];
  text: string;
  html?: string;
  lines?: OcrLine[];
  score?: number | null;
}

export interface ProcessImageResponse {
  rawText: string;
  markdown: string;
  filename: string;
  blocks?: OcrBlock[];
}

export interface OcrHealthPayload {}

export interface OcrHealthResponse {
  ocrReachable: boolean;
  ocrModels: string[];
  ocrDevice: 'gpu' | 'cpu' | null;
  lmStudioReachable: boolean;
  lmStudioModels: string[];
}
