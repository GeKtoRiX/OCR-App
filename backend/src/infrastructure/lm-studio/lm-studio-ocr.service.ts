import { Injectable } from '@nestjs/common';
import { ImageData } from '../../domain/entities/image-data.entity';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';

@Injectable()
export class LMStudioOCRService extends IOCRService {
  constructor(
    private readonly client: LMStudioClient,
    private readonly config: LMStudioConfig,
  ) {
    super();
  }

  async extractText(image: ImageData): Promise<string> {
    return this.client.chatCompletion({
      model: this.config.ocrModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: image.toBase64DataUrl() },
            },
            {
              type: 'text',
              text: 'OCR:',
            },
          ],
        },
      ],
      temperature: 0.0,
      max_tokens: 4096,
    });
  }
}
