import { Injectable } from '@nestjs/common';
import { IHealthCheckPort } from '../../domain/ports/health-check.port';
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
export class LMStudioClient extends IHealthCheckPort {
  private readonly chatUrl: string;
  private readonly modelsUrl: string;

  constructor(private readonly config: LMStudioConfig) {
    super();
    this.chatUrl = `${config.baseUrl}/chat/completions`;
    this.modelsUrl = `${config.baseUrl}/models`;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const response = await fetch(this.chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.1,
          max_tokens: params.max_tokens ?? 4096,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `LM Studio API error (${response.status}): ${errorBody}`,
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels(): Promise<string[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(this.modelsUrl, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LM Studio models endpoint returned ${response.status}`);
      }

      const data = (await response.json()) as ModelsResponse;
      return data.data.map((m) => m.id);
    } finally {
      clearTimeout(timeout);
    }
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
