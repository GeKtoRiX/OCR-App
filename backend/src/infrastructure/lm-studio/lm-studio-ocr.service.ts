import { Injectable } from '@nestjs/common';
import { ImageData } from '../../domain/entities/image-data.entity';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';
import { LMStudioConfig } from '../config/lm-studio.config';

@Injectable()
export class LMStudioOCRService extends IOCRService {
  constructor(
    private readonly client: ILmStudioChatPort,
    private readonly config: LMStudioConfig,
  ) {
    super();
  }

  async extractText(image: ImageData): Promise<string> {
    return this.client.chatCompletion(
      [
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
      this.config.ocrModel,
      {
        temperature: 0.0,
        maxTokens: 4096,
      },
    );
  }
}
