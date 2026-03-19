import { Injectable } from '@nestjs/common';
import { NO_TEXT_DETECTED } from '../../domain/constants';
import { ImageData } from '../../domain/entities/image-data.entity';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { ITextStructuringService } from '../../domain/ports/text-structuring-service.port';
import { ProcessImageInput, ProcessImageOutput } from '../dto/process-image.dto';

@Injectable()
export class ProcessImageUseCase {
  constructor(
    private readonly ocrService: IOCRService,
    private readonly structuringService: ITextStructuringService,
  ) {}

  async execute(input: ProcessImageInput): Promise<ProcessImageOutput> {
    const imageData = new ImageData(
      input.buffer,
      input.mimeType,
      input.originalName,
    );

    const rawText = await this.ocrService.extractText(imageData);

    if (!rawText || !rawText.trim()) {
      return {
        rawText: NO_TEXT_DETECTED,
        markdown: NO_TEXT_DETECTED,
      };
    }

    const markdown = await this.structuringService.structureAsMarkdown(rawText);

    return { rawText, markdown };
  }
}
