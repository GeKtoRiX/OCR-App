import { LMStudioStructuringService } from './lm-studio-structuring.service';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';

async function* fakeStream(...chunks: string[]): AsyncGenerator<string> {
  for (const c of chunks) yield c;
}

async function* failingStream(err: Error): AsyncGenerator<string> {
  throw err;
}

describe('LMStudioStructuringService', () => {
  let service: LMStudioStructuringService;
  let mockClient: jest.Mocked<LMStudioClient>;
  let config: LMStudioConfig;

  beforeEach(() => {
    mockClient = {
      chatCompletion: jest.fn(),
      chatCompletionStream: jest.fn(),
    } as any;
    config = Object.assign(new LMStudioConfig(), {
      structuringModel: 'test-struct-model',
    });
    service = new LMStudioStructuringService(mockClient, config);
  });

  it('should call chatCompletionStream with system prompt and raw text', async () => {
    mockClient.chatCompletionStream.mockReturnValue(
      fakeStream('# Structured', '\n\n', 'Content'),
    );

    const result = await service.structureAsMarkdown('Raw OCR text here');

    expect(result).toBe('# Structured\n\nContent');
    expect(mockClient.chatCompletionStream).toHaveBeenCalledWith({
      model: 'test-struct-model',
      messages: [
        {
          role: 'system',
          content: expect.stringContaining('expert document formatter'),
        },
        {
          role: 'user',
          content: expect.stringContaining('Raw OCR text here'),
        },
      ],
      temperature: 0.05,
      max_tokens: 4096,
    });
  });

  it('should include structuring rules in system prompt', async () => {
    mockClient.chatCompletionStream.mockReturnValue(fakeStream('md'));

    await service.structureAsMarkdown('text');

    const systemMsg =
      mockClient.chatCompletionStream.mock.calls[0][0].messages[0];
    expect(systemMsg.content).toContain('## Structure');
    expect(systemMsg.content).toContain(
      'Preserve ALL original words and numbers exactly',
    );
  });

  it('should propagate client errors', async () => {
    mockClient.chatCompletionStream.mockReturnValue(
      failingStream(new Error('timeout')),
    );

    await expect(service.structureAsMarkdown('text')).rejects.toThrow(
      'timeout',
    );
  });
});
