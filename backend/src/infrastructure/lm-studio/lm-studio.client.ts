import { Injectable } from '@nestjs/common';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { LMStudioConfig } from '../config/lm-studio.config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

interface ModelsResponse {
  data: Array<{ id: string }>;
}

@Injectable()
export class LMStudioClient extends ILmStudioHealthPort {
  private readonly chatUrl: string;
  private readonly modelsUrl: string;

  constructor(private readonly config: LMStudioConfig) {
    super();
    this.chatUrl = `${config.baseUrl}/chat/completions`;
    this.modelsUrl = `${config.baseUrl}/models`;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<string> {
    const response = await fetch(this.chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.1,
        max_tokens: params.max_tokens ?? 4096,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `LM Studio API error (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return data.choices[0].message.content;
  }

  async *chatCompletionStream(
    params: ChatCompletionParams,
  ): AsyncGenerator<string> {
    const response = await fetch(this.chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.1,
        max_tokens: params.max_tokens ?? 4096,
        stream: true,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `LM Studio API error (${response.status}): ${errorBody}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

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
          if (payload === '[DONE]') return;

          try {
            const chunk = JSON.parse(payload) as {
              choices: Array<{ delta: { content?: string } }>;
            };
            const content = chunk.choices[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(this.modelsUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`LM Studio models endpoint returned ${response.status}`);
    }

    const data = (await response.json()) as ModelsResponse;
    return data.data.map((m) => m.id);
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }
}
