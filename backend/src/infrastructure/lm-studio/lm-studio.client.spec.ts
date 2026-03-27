import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';

describe('LMStudioClient', () => {
  let client: LMStudioClient;
  let config: LMStudioConfig;

  beforeEach(() => {
    config = new LMStudioConfig();
    config = Object.assign(config, {
      baseUrl: 'http://localhost:1234/v1',
      timeoutMs: 5000,
    });
    client = new LMStudioClient(config);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('chatCompletion', () => {
    it('should send correct request and return content', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OCR result text' } }],
        }),
      });

      const result = await client.chatCompletion(
        [{ role: 'user', content: 'Hello' }],
        'test-model',
      );

      expect(result).toBe('OCR result text');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.model).toBe('test-model');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(body.temperature).toBe(0.1);
      expect(body.max_tokens).toBe(4096);
    });

    it('should use provided temperature and max_tokens', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'text' } }],
        }),
      });

      await client.chatCompletion(
        [{ role: 'user', content: 'Hi' }],
        'model',
        {
          temperature: 0.5,
          maxTokens: 1024,
        },
      );

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(1024);
    });

    it('should throw on non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(
        client.chatCompletion([{ role: 'user', content: 'Hi' }], 'model'),
      ).rejects.toThrow('LM Studio API error (500): Internal Server Error');
    });
  });

  describe('chatCompletionStream', () => {
    function createReader(chunks: string[]) {
      const releaseLock = jest.fn();
      let index = 0;
      return {
        releaseLock,
        read: jest.fn(async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = new TextEncoder().encode(chunks[index]);
          index++;
          return { done: false, value };
        }),
      };
    }

    it('streams content, ignores malformed chunks, and releases the reader lock', async () => {
      const reader = createReader([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n' +
          'data: {"choices":[{"delta":{"cont',
        'ent":"lo"}}]}\n' +
          'data: {bad json}\n' +
          'event: ping\n' +
          'data: [DONE]\n',
      ]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => reader,
        },
      });

      const chunks: string[] = [];
      for await (const part of client.chatCompletionStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(part);
      }

      expect(chunks).toEqual(['Hel', 'lo']);
      expect(reader.releaseLock).toHaveBeenCalled();

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.stream).toBe(true);
    });

    it('uses explicit stream params, skips empty deltas, and exits on reader completion', async () => {
      const reader = createReader([
        'data: {"choices":[]}\n' +
          'data: {"choices":[{}]}\n' +
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
      ]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => reader,
        },
      });

      const chunks: string[] = [];
      for await (const part of client.chatCompletionStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.4,
        max_tokens: 128,
      })) {
        chunks.push(part);
      }

      expect(chunks).toEqual(['Hi']);
      expect(reader.read).toHaveBeenCalledTimes(2);
      expect(reader.releaseLock).toHaveBeenCalled();

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.temperature).toBe(0.4);
      expect(body.max_tokens).toBe(128);
      expect(body.stream).toBe(true);
    });

    it('throws when the stream request returns a non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service unavailable',
      });

      const consume = async () => {
        for await (const _part of client.chatCompletionStream({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hello' }],
        })) {
          // noop
        }
      };

      await expect(consume()).rejects.toThrow(
        'LM Studio API error (503): Service unavailable',
      );
    });

    it('throws when the response body is missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: null,
      });

      const consume = async () => {
        for await (const _part of client.chatCompletionStream({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hello' }],
        })) {
          // noop
        }
      };

      await expect(consume()).rejects.toThrow('No response body');
    });
  });

  describe('listModels', () => {
    it('should return model IDs', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'model-1' }, { id: 'model-2' }],
        }),
      });

      const models = await client.listModels();

      expect(models).toEqual(['model-1', 'model-2']);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/models',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should throw on non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(client.listModels()).rejects.toThrow(
        'LM Studio models endpoint returned 404',
      );
    });
  });

  describe('isReachable', () => {
    it('should return true when listModels succeeds', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'm1' }] }),
      });

      expect(await client.isReachable()).toBe(true);
    });

    it('should return false when fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      expect(await client.isReachable()).toBe(false);
    });
  });
});
