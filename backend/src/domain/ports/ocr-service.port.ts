import { ImageData } from '../entities/image-data.entity';
import { OcrBlock } from '@ocr-app/shared';

export interface OcrExtractionResult {
  rawText: string;
  markdown: string;
  blocks?: OcrBlock[];
}

export abstract class IOCRService {
  abstract extractText(image: ImageData): Promise<OcrExtractionResult>;
}
