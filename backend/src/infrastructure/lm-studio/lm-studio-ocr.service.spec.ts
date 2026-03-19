import { LMStudioOCRService } from './lm-studio-ocr.service';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';
import { ImageData } from '../../domain/entities/image-data.entity';

describe('LMStudioOCRService', () => {
  let service: LMStudioOCRService;
  let mockClient: jest.Mocked<LMStudioClient>;
  let config: LMStudioConfig;

  beforeEach(() => {
    mockClient = { chatCompletion: jest.fn() } as any;
    config = Object.assign(new LMStudioConfig(), { ocrModel: 'test-ocr-model' });
    service = new LMStudioOCRService(mockClient, config);
  });

  it('should call chatCompletion with image data URL and OCR prompt', async () => {
    const buffer = Buffer.from('test-image');
    const image = new ImageData(buffer, 'image/png', 'test.png');
    mockClient.chatCompletion.mockResolvedValue('Extracted text');

    const result = await service.extractText(image);

    expect(result).toBe('Extracted text');
    expect(mockClient.chatCompletion).toHaveBeenCalledWith({
      model: 'test-ocr-model',
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
  });

  it('should propagate client errors', async () => {
    const image = new ImageData(Buffer.from('x'), 'image/png', 'x.png');
    mockClient.chatCompletion.mockRejectedValue(new Error('API down'));

    await expect(service.extractText(image)).rejects.toThrow('API down');
  });
});
