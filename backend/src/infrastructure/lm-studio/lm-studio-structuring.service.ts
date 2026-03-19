import { Injectable } from '@nestjs/common';
import { ITextStructuringService } from '../../domain/ports/text-structuring-service.port';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';

const STRUCTURING_SYSTEM_PROMPT = `You are a document structure reconstruction assistant.
You receive raw OCR text extracted from a document image.
Your task is to reconstruct the document's logical structure using Markdown formatting.

Rules:
- Use # for chapter titles or main headings
- Use ## for sections
- Use ### for subsections
- Reconstruct paragraphs with proper line breaks
- Use - or * for unordered lists, 1. 2. 3. for ordered lists
- Use > for quoted text or dialogue
- Use Markdown tables (|---|) when tabular data is detected
- Preserve all original text content exactly — do not add, remove, or rephrase any words
- Output ONLY the Markdown document, no explanations or preamble`;

@Injectable()
export class LMStudioStructuringService extends ITextStructuringService {
  constructor(
    private readonly client: LMStudioClient,
    private readonly config: LMStudioConfig,
  ) {
    super();
  }

  async structureAsMarkdown(rawText: string): Promise<string> {
    return this.client.chatCompletion({
      model: this.config.structuringModel,
      messages: [
        {
          role: 'system',
          content: STRUCTURING_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Reconstruct the following OCR text into a well-structured Markdown document:\n\n${rawText}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });
  }
}
