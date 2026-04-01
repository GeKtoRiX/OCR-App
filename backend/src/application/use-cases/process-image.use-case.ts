import { Injectable } from '@nestjs/common';
import { NO_TEXT_DETECTED } from '../../domain/constants';
import { ImageData } from '../../domain/entities/image-data.entity';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { ProcessImageInput, ProcessImageOutput } from '../dto/process-image.dto';

@Injectable()
export class ProcessImageUseCase {
  constructor(private readonly ocrService: IOCRService) {}

  async execute(input: ProcessImageInput): Promise<ProcessImageOutput> {
    const imageData = new ImageData(
      input.buffer,
      input.mimeType,
      input.originalName,
    );

    const result = await this.ocrService.extractText(imageData);
    const rawText = result.rawText;

    if (!rawText || !rawText.trim()) {
      return {
        rawText: NO_TEXT_DETECTED,
        markdown: NO_TEXT_DETECTED,
        blocks: [],
      };
    }

    return {
      rawText,
      markdown: result.markdown?.trim() ? result.markdown : rawText,
      blocks: result.blocks ?? [],
    };
  }
}
