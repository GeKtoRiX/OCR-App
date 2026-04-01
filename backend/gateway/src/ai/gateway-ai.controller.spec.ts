import { GatewayAiController } from './gateway-ai.controller';

function makeMockResponse() {
  const headers = new Map<string, string>();
  const writes: string[] = [];

  return {
    headers,
    writes,
    ended: false,
    setHeader: jest.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => {
      writes.push(chunk);
    }),
    end: jest.fn(function (this: any) {
      this.ended = true;
    }),
  };
}

function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });

  return new Response(body, { status: 200 });
}

describe('GatewayAiController', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.LM_STUDIO_BASE_URL = 'http://lmstudio.local/v1';
    process.env.VOCABULARY_MODEL = 'test-model';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.LM_STUDIO_BASE_URL;
    delete process.env.VOCABULARY_MODEL;
  });

  it('streams SSE text chunks and finishes with [DONE]', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      makeStreamResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n',
        'data: [DONE]\n\n',
      ]),
    ) as any;

    const controller = new GatewayAiController();
    const res = makeMockResponse();

    await controller.chat(
      {
        messages: [{ role: 'user', content: 'Hi' }],
      },
      res as any,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://lmstudio.local/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        }),
      }),
    );
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(res.writes).toContain('data: {"text":"Hello"}\n\n');
    expect(res.writes).toContain('data: {"text":" world"}\n\n');
    expect(res.writes).toContain('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('writes an SSE error when LM Studio returns a non-OK status', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('backend unavailable', { status: 503, statusText: 'Service Unavailable' }),
    ) as any;

    const controller = new GatewayAiController();
    const res = makeMockResponse();

    await controller.chat(
      {
        messages: [{ role: 'user', content: 'Hi' }],
      },
      res as any,
    );

    expect(res.writes).toContain(
      'data: {"error":"LM Studio error 503: backend unavailable"}\n\n',
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('writes an SSE error when LM Studio returns no response body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
    }) as any;

    const controller = new GatewayAiController();
    const res = makeMockResponse();

    await controller.chat(
      {
        messages: [{ role: 'user', content: 'Hi' }],
      },
      res as any,
    );

    expect(res.writes).toContain(
      'data: {"error":"No response body from LM Studio"}\n\n',
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('skips malformed SSE chunks and still finishes cleanly', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      makeStreamResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {not-json}\n',
        'data: [DONE]\n\n',
      ]),
    ) as any;

    const controller = new GatewayAiController();
    const res = makeMockResponse();

    await controller.chat(
      {
        messages: [{ role: 'user', content: 'Hi' }],
      },
      res as any,
    );

    expect(res.writes).toContain('data: {"text":"Hello"}\n\n');
    expect(res.writes).toContain('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('writes an SSE error when the upstream request throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as any;

    const controller = new GatewayAiController();
    const res = makeMockResponse();

    await controller.chat(
      {
        messages: [{ role: 'user', content: 'Hi' }],
      },
      res as any,
    );

    expect(res.writes).toContain('data: {"error":"connect ECONNREFUSED"}\n\n');
    expect(res.end).toHaveBeenCalled();
  });
});
