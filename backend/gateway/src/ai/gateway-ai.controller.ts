import { Body, Controller, Post, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AiChatBody {
  messages: ChatMessage[];
  model?: string;
}

@SkipThrottle()
@Controller('api/ai')
export class GatewayAiController {
  private readonly lmStudioUrl =
    process.env.LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1';

  private readonly defaultModel =
    process.env.VOCABULARY_MODEL ??
    process.env.STRUCTURING_MODEL ??
    'qwen/qwen3.5-9b';

  @Post('chat')
  async chat(@Body() body: AiChatBody, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const lmRes = await fetch(`${this.lmStudioUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: body.model ?? this.defaultModel,
          messages: body.messages,
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        }),
      });

      if (!lmRes.ok) {
        const errorText = await lmRes.text().catch(() => lmRes.statusText);
        res.write(
          `data: ${JSON.stringify({ error: `LM Studio error ${lmRes.status}: ${errorText}` })}\n\n`,
        );
        res.end();
        return;
      }

      const reader = lmRes.body?.getReader();
      if (!reader) {
        res.write(`data: ${JSON.stringify({ error: 'No response body from LM Studio' })}\n\n`);
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            try {
              const chunk = JSON.parse(payload) as {
                choices: Array<{ delta: { content?: string } }>;
              };
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      res.write('data: [DONE]\n\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    }

    res.end();
  }
}
