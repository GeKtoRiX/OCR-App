export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export abstract class ILmStudioChatPort {
  abstract chatCompletion(
    messages: ChatMessage[],
    model: string,
    opts?: ChatOptions,
  ): Promise<string>;
}
