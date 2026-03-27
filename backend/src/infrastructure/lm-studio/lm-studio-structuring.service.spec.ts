import { LMStudioStructuringService } from './lm-studio-structuring.service';
import { LMStudioConfig } from '../config/lm-studio.config';
import { ILmStudioChatPort } from '../../domain/ports/lm-studio-chat.port';

describe('LMStudioStructuringService', () => {
  let service: LMStudioStructuringService;
  let mockClient: jest.Mocked<ILmStudioChatPort>;
  let config: LMStudioConfig;

  beforeEach(() => {
    mockClient = {
      chatCompletion: jest.fn(),
    } as any;
    config = Object.assign(new LMStudioConfig(), {
      structuringModel: 'test-struct-model',
    });
    service = new LMStudioStructuringService(mockClient, config);
  });

  it('should call chatCompletion with system prompt and raw text', async () => {
    mockClient.chatCompletion.mockResolvedValue('# Structured\n\nContent');

    const result = await service.structureAsMarkdown('Raw OCR text here');

    expect(result).toBe('# Structured\n\nContent');
    expect(mockClient.chatCompletion).toHaveBeenCalledWith(
      [
        {
          role: 'system',
          content: expect.stringContaining('expert document formatter'),
        },
        {
          role: 'user',
          content: expect.stringContaining('Raw OCR text here'),
        },
      ],
      'test-struct-model',
      {
        temperature: 0.05,
        maxTokens: 4096,
      },
    );
  });

  it('should include structuring rules in system prompt', async () => {
    mockClient.chatCompletion.mockResolvedValue('md');

    await service.structureAsMarkdown('text');

    const systemMsg = mockClient.chatCompletion.mock.calls[0][0][0];
    expect(systemMsg.content).toContain('## Structure');
    expect(systemMsg.content).toContain(
      'Preserve ALL original words and numbers exactly',
    );
  });

  it('should propagate client errors', async () => {
    mockClient.chatCompletion.mockRejectedValue(new Error('timeout'));

    await expect(service.structureAsMarkdown('text')).rejects.toThrow(
      'timeout',
    );
  });
});
