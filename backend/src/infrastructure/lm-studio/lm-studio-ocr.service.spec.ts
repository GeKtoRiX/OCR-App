import { LMStudioOCRService } from './lm-studio-ocr.service';
import { LMStudioConfig } from '../config/lm-studio.config';
import { ImageData } from '../../domain/entities/image-data.entity';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';

describe('LMStudioOCRService', () => {
  let service: LMStudioOCRService;
  let mockClient: jest.Mocked<ILmStudioChatPort>;
  let config: LMStudioConfig;

  beforeEach(() => {
    mockClient = { chatCompletion: jest.fn() } as any;
    config = Object.assign(new LMStudioConfig(), { ocrModel: 'test-ocr-model' });
    service = new LMStudioOCRService(mockClient, config);
  });

  it('calls chatCompletion with system and user OCR prompts', async () => {
    const image = new ImageData(Buffer.from('test-image'), 'image/png', 'test.png');
    mockClient.chatCompletion.mockResolvedValue('Extracted text');

    const result = await service.extractText(image);

    expect(result.rawText).toBe('Extracted text');
    expect(result.markdown).toBe('Extracted text');
    expect(result.blocks?.[0]?.lines).toEqual([{ text: 'Extracted text', bbox: [] }]);

    expect(mockClient.chatCompletion).toHaveBeenCalledWith(
      [
        {
          role: 'system',
          content: expect.stringContaining('You are an OCR engine.'),
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: image.toBase64DataUrl() },
            },
            {
              type: 'text',
              text: expect.stringContaining('Preserve line breaks aggressively.'),
            },
          ],
        },
      ],
      'test-ocr-model',
      {
        temperature: 0.0,
        maxTokens: 6144,
      },
    );
  });

  it('post-processes merged structural fragments into cleaner lines', async () => {
    mockClient.chatCompletion.mockResolvedValue(
      [
        '1 New friends 1A What\'s your name? Vocabulary numbers 0-12 Grammar I, my, you, your',
        'Real World saying hello; introducing people; phone numbers; saying goodbye',
        'A SUE Hello, my name\'s Sue. What\'s name? MARIO Hello, \'m Mario.',
        'b) Practise conversation 1 with four students. Use your name.',
      ].join('\n'),
    );

    const result = await service.extractText(
      new ImageData(Buffer.from('x'), 'image/jpeg', 'page.jpg'),
    );

    expect(result.rawText).toContain('Vocabulary numbers 0-12');
    expect(result.rawText).toContain('1 New friends\n1A What\'s your name?');
    expect(result.rawText).toContain('\nGrammar I, my, you, your');
    expect(result.rawText).toContain('\nA');
    expect(result.rawText).toContain('\nSUE Hello, my name\'s Sue.');
    expect(result.rawText).toContain('\nMARIO Hello, \'m Mario.');
    expect(result.rawText).toContain('\nb) Practise conversation 1 with four students. Use your name.');
    expect(result.blocks?.[0]?.lines).toEqual(
      expect.arrayContaining([
        { text: 'A', bbox: [] },
        { text: 'SUE Hello, my name\'s Sue. What\'s name?', bbox: [] },
        { text: 'MARIO Hello, \'m Mario.', bbox: [] },
      ]),
    );
  });

  it('propagates client errors', async () => {
    const image = new ImageData(Buffer.from('x'), 'image/png', 'x.png');
    mockClient.chatCompletion.mockRejectedValue(new Error('API down'));

    await expect(service.extractText(image)).rejects.toThrow('API down');
  });
});
