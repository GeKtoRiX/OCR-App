import { Injectable } from '@nestjs/common';

@Injectable()
export class LMStudioConfig {
  readonly baseUrl: string =
    process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
  readonly ocrModel: string =
    process.env.OCR_MODEL || process.env.STRUCTURING_MODEL || 'qwen/qwen3.5-9b';
  readonly structuringModel: string =
    process.env.STRUCTURING_MODEL || 'qwen/qwen3.5-9b';
  readonly vocabularyModel: string =
    process.env.VOCABULARY_MODEL || process.env.STRUCTURING_MODEL || 'qwen/qwen3.5-9b';
  readonly timeoutMs: number = parseInt(
    process.env.LM_STUDIO_TIMEOUT || '120000',
    10,
  );
}
