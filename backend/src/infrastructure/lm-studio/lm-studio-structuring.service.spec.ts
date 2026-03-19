import { LMStudioStructuringService } from './lm-studio-structuring.service';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';

describe('LMStudioStructuringService', () => {
  let service: LMStudioStructuringService;
  let mockClient: jest.Mocked<LMStudioClient>;
  let config: LMStudioConfig;

  beforeEach(() => {
    mockClient = { chatCompletion: jest.fn() } as any;
    config = Object.assign(new LMStudioConfig(), {
      structuringModel: 'test-struct-model',
    });
    service = new LMStudioStructuringService(mockClient, config);
  });

  it('should call chatCompletion with system prompt and raw text', async () => {
    mockClient.chatCompletion.mockResolvedValue('# Structured\n\nContent');

    const result = await service.structureAsMarkdown('Raw OCR text here');

    expect(result).toBe('# Structured\n\nContent');
    expect(mockClient.chatCompletion).toHaveBeenCalledWith({
      model: 'test-struct-model',
      messages: [
        {
          role: 'system',
          content: expect.stringContaining('document structure reconstruction'),
        },
        {
          role: 'user',
          content: expect.stringContaining('Raw OCR text here'),
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });
  });

  it('should include structuring rules in system prompt', async () => {
    mockClient.chatCompletion.mockResolvedValue('md');

    await service.structureAsMarkdown('text');

    const systemMsg = mockClient.chatCompletion.mock.calls[0][0].messages[0];
    expect(systemMsg.content).toContain('# for chapter titles');
    expect(systemMsg.content).toContain('Preserve all original text content');
  });

  it('should propagate client errors', async () => {
    mockClient.chatCompletion.mockRejectedValue(new Error('timeout'));

    await expect(service.structureAsMarkdown('text')).rejects.toThrow('timeout');
  });
});
