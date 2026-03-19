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

      const result = await client.chatCompletion({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      });

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

      await client.chatCompletion({
        model: 'model',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.5,
        max_tokens: 1024,
      });

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
        client.chatCompletion({
          model: 'model',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('LM Studio API error (500): Internal Server Error');
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
